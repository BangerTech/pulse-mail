using Microsoft.Data.Sqlite;
using PulseMail.Core.Models;
using System.Text.Json;

namespace PulseMail.Core.Data;

public sealed class MailDatabase : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly object _lock = new();

    public MailDatabase(string? path = null)
    {
        var dbPath = path ?? AppPaths.DatabasePath;
        var dir = Path.GetDirectoryName(dbPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        _conn = new SqliteConnection($"Data Source={dbPath}");
        _conn.Open();
        Execute("PRAGMA journal_mode=WAL;");
        Execute("PRAGMA foreign_keys=ON;");
        CreateSchema();
    }

    public void Dispose() => _conn.Dispose();

    private void CreateSchema()
    {
        Execute("""
            CREATE TABLE IF NOT EXISTS accounts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              imap_host TEXT NOT NULL,
              imap_port INTEGER DEFAULT 993,
              smtp_host TEXT NOT NULL,
              smtp_port INTEGER DEFAULT 587,
              username TEXT NOT NULL,
              credential_key TEXT NOT NULL,
              color TEXT DEFAULT '#007AFF',
              auth_type TEXT DEFAULT 'password',
              oauth_refresh_key TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS signatures (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              content TEXT NOT NULL,
              is_default INTEGER DEFAULT 0,
              account_id INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS mail_cache (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              account_id INTEGER NOT NULL,
              folder TEXT NOT NULL,
              uid INTEGER NOT NULL,
              message_id TEXT,
              subject TEXT,
              from_address TEXT,
              from_name TEXT,
              to_address TEXT,
              cc_address TEXT,
              reply_to_address TEXT,
              date DATETIME,
              snippet TEXT,
              flags TEXT DEFAULT '[]',
              has_attachments INTEGER DEFAULT 0,
              body_html TEXT,
              body_text TEXT,
              attachments_meta TEXT,
              in_reply_to TEXT,
              references_header TEXT,
              thread_id TEXT,
              raw_headers TEXT,
              extracted_pdf_text TEXT,
              cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
              UNIQUE(account_id, folder, uid)
            );

            CREATE INDEX IF NOT EXISTS idx_mail_account_folder ON mail_cache(account_id, folder, date DESC);
            CREATE INDEX IF NOT EXISTS idx_mail_thread ON mail_cache(account_id, folder, thread_id);
            CREATE INDEX IF NOT EXISTS idx_mail_message_id ON mail_cache(message_id);

            CREATE TABLE IF NOT EXISTS folder_sync (
              account_id INTEGER NOT NULL,
              folder TEXT NOT NULL,
              uid_validity INTEGER,
              last_sync_at DATETIME,
              PRIMARY KEY (account_id, folder)
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS image_allowlist (
              domain TEXT PRIMARY KEY,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS pending_ops (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              account_id INTEGER NOT NULL,
              folder TEXT NOT NULL,
              uid INTEGER NOT NULL,
              op_type TEXT NOT NULL,
              payload_json TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS folder_cache (
              account_id INTEGER NOT NULL,
              full_name TEXT NOT NULL,
              name TEXT NOT NULL,
              special_use TEXT,
              unread_count INTEGER DEFAULT 0,
              total_count INTEGER DEFAULT 0,
              PRIMARY KEY (account_id, full_name)
            );
            """);
    }

    private void Execute(string sql)
    {
        lock (_lock)
        {
            using var cmd = _conn.CreateCommand();
            cmd.CommandText = sql;
            cmd.ExecuteNonQuery();
        }
    }

    private SqliteCommand Cmd(string sql)
    {
        var cmd = _conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // ── Settings ──────────────────────────────────────────────

    public string? GetSetting(string key)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT value FROM settings WHERE key = $k");
            cmd.Parameters.AddWithValue("$k", key);
            return cmd.ExecuteScalar() as string;
        }
    }

    public void SetSetting(string key, string value)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                INSERT INTO settings(key, value) VALUES($k, $v)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """);
            cmd.Parameters.AddWithValue("$k", key);
            cmd.Parameters.AddWithValue("$v", value);
            cmd.ExecuteNonQuery();
        }
    }

    public bool GetBoolSetting(string key, bool defaultValue = false)
    {
        var v = GetSetting(key);
        if (v is null) return defaultValue;
        return v is "1" or "true" or "True";
    }

    public void SetBoolSetting(string key, bool value) =>
        SetSetting(key, value ? "1" : "0");

    // ── Accounts ──────────────────────────────────────────────

    public List<Account> GetAccounts()
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM accounts ORDER BY id");
            using var r = cmd.ExecuteReader();
            var list = new List<Account>();
            while (r.Read()) list.Add(ReadAccount(r));
            return list;
        }
    }

    public Account? GetAccount(int id)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM accounts WHERE id = $id");
            cmd.Parameters.AddWithValue("$id", id);
            using var r = cmd.ExecuteReader();
            return r.Read() ? ReadAccount(r) : null;
        }
    }

    public int InsertAccount(Account a)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                INSERT INTO accounts(name, email, imap_host, imap_port, smtp_host, smtp_port,
                  username, credential_key, color, auth_type, oauth_refresh_key)
                VALUES($name, $email, $imap_host, $imap_port, $smtp_host, $smtp_port,
                  $username, $credential_key, $color, $auth_type, $oauth_refresh_key);
                SELECT last_insert_rowid();
                """);
            BindAccount(cmd, a);
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public void UpdateAccount(Account a)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                UPDATE accounts SET name=$name, email=$email, imap_host=$imap_host, imap_port=$imap_port,
                  smtp_host=$smtp_host, smtp_port=$smtp_port, username=$username,
                  credential_key=$credential_key, color=$color, auth_type=$auth_type,
                  oauth_refresh_key=$oauth_refresh_key
                WHERE id=$id
                """);
            BindAccount(cmd, a);
            cmd.Parameters.AddWithValue("$id", a.Id);
            cmd.ExecuteNonQuery();
        }
    }

    public void DeleteAccount(int id)
    {
        lock (_lock)
        {
            using (var cmd = Cmd("DELETE FROM mail_cache WHERE account_id=$id"))
            {
                cmd.Parameters.AddWithValue("$id", id);
                cmd.ExecuteNonQuery();
            }
            using (var cmd = Cmd("DELETE FROM folder_sync WHERE account_id=$id"))
            {
                cmd.Parameters.AddWithValue("$id", id);
                cmd.ExecuteNonQuery();
            }
            using (var cmd = Cmd("DELETE FROM folder_cache WHERE account_id=$id"))
            {
                cmd.Parameters.AddWithValue("$id", id);
                cmd.ExecuteNonQuery();
            }
            using (var cmd = Cmd("DELETE FROM pending_ops WHERE account_id=$id"))
            {
                cmd.Parameters.AddWithValue("$id", id);
                cmd.ExecuteNonQuery();
            }
            using (var cmd = Cmd("DELETE FROM accounts WHERE id=$id"))
            {
                cmd.Parameters.AddWithValue("$id", id);
                cmd.ExecuteNonQuery();
            }
        }
    }

    private static Account ReadAccount(SqliteDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("id")),
        Name = r.GetString(r.GetOrdinal("name")),
        Email = r.GetString(r.GetOrdinal("email")),
        ImapHost = r.GetString(r.GetOrdinal("imap_host")),
        ImapPort = r.GetInt32(r.GetOrdinal("imap_port")),
        SmtpHost = r.GetString(r.GetOrdinal("smtp_host")),
        SmtpPort = r.GetInt32(r.GetOrdinal("smtp_port")),
        Username = r.GetString(r.GetOrdinal("username")),
        CredentialKey = r.GetString(r.GetOrdinal("credential_key")),
        Color = r.IsDBNull(r.GetOrdinal("color")) ? "#007AFF" : r.GetString(r.GetOrdinal("color")),
        AuthType = r.IsDBNull(r.GetOrdinal("auth_type")) ? "password" : r.GetString(r.GetOrdinal("auth_type")),
        OAuthRefreshTokenKey = r.IsDBNull(r.GetOrdinal("oauth_refresh_key")) ? null : r.GetString(r.GetOrdinal("oauth_refresh_key")),
        CreatedAt = DateTime.TryParse(r["created_at"]?.ToString(), out var d) ? d : DateTime.UtcNow
    };

    private static void BindAccount(SqliteCommand cmd, Account a)
    {
        cmd.Parameters.AddWithValue("$name", a.Name);
        cmd.Parameters.AddWithValue("$email", a.Email);
        cmd.Parameters.AddWithValue("$imap_host", a.ImapHost);
        cmd.Parameters.AddWithValue("$imap_port", a.ImapPort);
        cmd.Parameters.AddWithValue("$smtp_host", a.SmtpHost);
        cmd.Parameters.AddWithValue("$smtp_port", a.SmtpPort);
        cmd.Parameters.AddWithValue("$username", a.Username);
        cmd.Parameters.AddWithValue("$credential_key", a.CredentialKey);
        cmd.Parameters.AddWithValue("$color", a.Color);
        cmd.Parameters.AddWithValue("$auth_type", a.AuthType ?? "password");
        cmd.Parameters.AddWithValue("$oauth_refresh_key", (object?)a.OAuthRefreshTokenKey ?? DBNull.Value);
    }

    // ── Mail cache ────────────────────────────────────────────

    public List<CachedMessage> GetMessages(int? accountId, string folder, int limit = 50, int offset = 0)
    {
        lock (_lock)
        {
            var sql = accountId is null
                ? """
                  SELECT * FROM mail_cache
                  WHERE folder = $folder OR ($folder = 'INBOX' AND folder LIKE '%INBOX%')
                  ORDER BY datetime(date) DESC LIMIT $limit OFFSET $offset
                  """
                : """
                  SELECT * FROM mail_cache
                  WHERE account_id = $aid AND folder = $folder
                  ORDER BY datetime(date) DESC LIMIT $limit OFFSET $offset
                  """;

            // Unified inbox: all INBOX folders across accounts
            if (accountId is null && folder == "INBOX")
            {
                sql = """
                    SELECT * FROM mail_cache
                    WHERE folder = 'INBOX' OR folder = 'Inbox'
                    ORDER BY datetime(date) DESC LIMIT $limit OFFSET $offset
                    """;
            }

            using var cmd = Cmd(sql);
            if (accountId is not null) cmd.Parameters.AddWithValue("$aid", accountId.Value);
            if (accountId is not null || folder != "INBOX")
                cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$limit", limit);
            cmd.Parameters.AddWithValue("$offset", offset);
            using var r = cmd.ExecuteReader();
            var list = new List<CachedMessage>();
            while (r.Read()) list.Add(ReadMessage(r));
            return list;
        }
    }

    public CachedMessage? GetMessage(int accountId, string folder, uint uid)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM mail_cache WHERE account_id=$aid AND folder=$folder AND uid=$uid");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$uid", (long)uid);
            using var r = cmd.ExecuteReader();
            return r.Read() ? ReadMessage(r) : null;
        }
    }

    public CachedMessage? GetMessageById(int id)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM mail_cache WHERE id=$id");
            cmd.Parameters.AddWithValue("$id", id);
            using var r = cmd.ExecuteReader();
            return r.Read() ? ReadMessage(r) : null;
        }
    }

    public void UpsertMessage(CachedMessage m)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                INSERT INTO mail_cache(
                  account_id, folder, uid, message_id, subject, from_address, from_name,
                  to_address, cc_address, reply_to_address, date, snippet, flags,
                  has_attachments, body_html, body_text, attachments_meta,
                  in_reply_to, references_header, thread_id, raw_headers, extracted_pdf_text, cached_at)
                VALUES(
                  $aid, $folder, $uid, $mid, $subject, $from_addr, $from_name,
                  $to, $cc, $reply, $date, $snippet, $flags,
                  $has_att, $html, $text, $att_meta,
                  $in_reply, $refs, $thread, $raw, $pdf, CURRENT_TIMESTAMP)
                ON CONFLICT(account_id, folder, uid) DO UPDATE SET
                  message_id=excluded.message_id,
                  subject=excluded.subject,
                  from_address=excluded.from_address,
                  from_name=excluded.from_name,
                  to_address=excluded.to_address,
                  cc_address=excluded.cc_address,
                  reply_to_address=excluded.reply_to_address,
                  date=excluded.date,
                  snippet=COALESCE(NULLIF(excluded.snippet,''), mail_cache.snippet),
                  flags=excluded.flags,
                  has_attachments=excluded.has_attachments,
                  body_html=COALESCE(NULLIF(excluded.body_html,''), mail_cache.body_html),
                  body_text=COALESCE(NULLIF(excluded.body_text,''), mail_cache.body_text),
                  attachments_meta=COALESCE(excluded.attachments_meta, mail_cache.attachments_meta),
                  in_reply_to=excluded.in_reply_to,
                  references_header=excluded.references_header,
                  thread_id=excluded.thread_id,
                  raw_headers=COALESCE(excluded.raw_headers, mail_cache.raw_headers),
                  extracted_pdf_text=COALESCE(excluded.extracted_pdf_text, mail_cache.extracted_pdf_text),
                  cached_at=CURRENT_TIMESTAMP
                """);
            BindMessage(cmd, m);
            cmd.ExecuteNonQuery();
        }
    }

    public void UpdateFlags(int accountId, string folder, uint uid, string flagsJson)
    {
        lock (_lock)
        {
            using var cmd = Cmd("UPDATE mail_cache SET flags=$flags WHERE account_id=$aid AND folder=$folder AND uid=$uid");
            cmd.Parameters.AddWithValue("$flags", flagsJson);
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$uid", (long)uid);
            cmd.ExecuteNonQuery();
        }
    }

    public void DeleteMessage(int accountId, string folder, uint uid)
    {
        lock (_lock)
        {
            using var cmd = Cmd("DELETE FROM mail_cache WHERE account_id=$aid AND folder=$folder AND uid=$uid");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$uid", (long)uid);
            cmd.ExecuteNonQuery();
        }
    }

    public void ClearFolder(int accountId, string folder)
    {
        lock (_lock)
        {
            using var cmd = Cmd("DELETE FROM mail_cache WHERE account_id=$aid AND folder=$folder");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.ExecuteNonQuery();
        }
    }

    public HashSet<uint> GetUidsInFolder(int accountId, string folder)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT uid FROM mail_cache WHERE account_id=$aid AND folder=$folder");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            using var r = cmd.ExecuteReader();
            var set = new HashSet<uint>();
            while (r.Read()) set.Add((uint)r.GetInt64(0));
            return set;
        }
    }

    public int CountUnread(int? accountId, string folder = "INBOX")
    {
        lock (_lock)
        {
            var sql = accountId is null
                ? """
                  SELECT COUNT(*) FROM mail_cache
                  WHERE (folder = 'INBOX' OR folder = 'Inbox')
                    AND flags NOT LIKE '%Seen%'
                  """
                : """
                  SELECT COUNT(*) FROM mail_cache
                  WHERE account_id=$aid AND folder=$folder AND flags NOT LIKE '%Seen%'
                  """;
            using var cmd = Cmd(sql);
            if (accountId is not null)
            {
                cmd.Parameters.AddWithValue("$aid", accountId.Value);
                cmd.Parameters.AddWithValue("$folder", folder);
            }
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public List<CachedMessage> GetThreadMessages(int accountId, string folder, string threadId)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                SELECT * FROM mail_cache
                WHERE account_id=$aid AND folder=$folder AND thread_id=$tid
                ORDER BY datetime(date) ASC
                """);
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$tid", threadId);
            using var r = cmd.ExecuteReader();
            var list = new List<CachedMessage>();
            while (r.Read()) list.Add(ReadMessage(r));
            return list;
        }
    }

    private static CachedMessage ReadMessage(SqliteDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("id")),
        AccountId = r.GetInt32(r.GetOrdinal("account_id")),
        Folder = r.GetString(r.GetOrdinal("folder")),
        Uid = (uint)r.GetInt64(r.GetOrdinal("uid")),
        MessageId = NullStr(r, "message_id"),
        Subject = NullStr(r, "subject"),
        FromAddress = NullStr(r, "from_address"),
        FromName = NullStr(r, "from_name"),
        ToAddress = NullStr(r, "to_address"),
        CcAddress = NullStr(r, "cc_address"),
        ReplyToAddress = NullStr(r, "reply_to_address"),
        Date = DateTime.TryParse(NullStr(r, "date"), out var d) ? d : null,
        Snippet = NullStr(r, "snippet"),
        Flags = NullStr(r, "flags") ?? "[]",
        HasAttachments = r.GetInt32(r.GetOrdinal("has_attachments")) == 1,
        BodyHtml = NullStr(r, "body_html"),
        BodyText = NullStr(r, "body_text"),
        AttachmentsMeta = NullStr(r, "attachments_meta"),
        InReplyTo = NullStr(r, "in_reply_to"),
        ReferencesHeader = NullStr(r, "references_header"),
        ThreadId = NullStr(r, "thread_id"),
        RawHeaders = NullStr(r, "raw_headers"),
        ExtractedPdfText = NullStr(r, "extracted_pdf_text"),
    };

    private static string? NullStr(SqliteDataReader r, string col)
    {
        var i = r.GetOrdinal(col);
        return r.IsDBNull(i) ? null : r.GetString(i);
    }

    private static void BindMessage(SqliteCommand cmd, CachedMessage m)
    {
        cmd.Parameters.AddWithValue("$aid", m.AccountId);
        cmd.Parameters.AddWithValue("$folder", m.Folder);
        cmd.Parameters.AddWithValue("$uid", (long)m.Uid);
        cmd.Parameters.AddWithValue("$mid", (object?)m.MessageId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$subject", (object?)m.Subject ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$from_addr", (object?)m.FromAddress ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$from_name", (object?)m.FromName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$to", (object?)m.ToAddress ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$cc", (object?)m.CcAddress ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$reply", (object?)m.ReplyToAddress ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$date", (object?)m.Date?.ToString("o") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$snippet", (object?)m.Snippet ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$flags", m.Flags);
        cmd.Parameters.AddWithValue("$has_att", m.HasAttachments ? 1 : 0);
        cmd.Parameters.AddWithValue("$html", (object?)m.BodyHtml ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$text", (object?)m.BodyText ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$att_meta", (object?)m.AttachmentsMeta ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$in_reply", (object?)m.InReplyTo ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$refs", (object?)m.ReferencesHeader ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$thread", (object?)m.ThreadId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$raw", (object?)m.RawHeaders ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$pdf", (object?)m.ExtractedPdfText ?? DBNull.Value);
    }

    // ── Folder sync ───────────────────────────────────────────

    public FolderSyncState? GetFolderSync(int accountId, string folder)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM folder_sync WHERE account_id=$aid AND folder=$folder");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            using var r = cmd.ExecuteReader();
            if (!r.Read()) return null;
            return new FolderSyncState
            {
                AccountId = accountId,
                Folder = folder,
                UidValidity = r.IsDBNull(r.GetOrdinal("uid_validity")) ? null : (uint)r.GetInt64(r.GetOrdinal("uid_validity")),
                LastSyncAt = DateTime.TryParse(r["last_sync_at"]?.ToString(), out var d) ? d : null
            };
        }
    }

    public void SetFolderSync(int accountId, string folder, uint uidValidity)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                INSERT INTO folder_sync(account_id, folder, uid_validity, last_sync_at)
                VALUES($aid, $folder, $uv, CURRENT_TIMESTAMP)
                ON CONFLICT(account_id, folder) DO UPDATE SET
                  uid_validity=excluded.uid_validity,
                  last_sync_at=CURRENT_TIMESTAMP
                """);
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            cmd.Parameters.AddWithValue("$uv", (long)uidValidity);
            cmd.ExecuteNonQuery();
        }
    }

    // ── Folder cache ──────────────────────────────────────────

    public void SaveFolders(int accountId, IEnumerable<FolderInfo> folders)
    {
        lock (_lock)
        {
            using (var del = Cmd("DELETE FROM folder_cache WHERE account_id=$aid"))
            {
                del.Parameters.AddWithValue("$aid", accountId);
                del.ExecuteNonQuery();
            }
            foreach (var f in folders)
            {
                using var cmd = Cmd("""
                    INSERT INTO folder_cache(account_id, full_name, name, special_use, unread_count, total_count)
                    VALUES($aid, $full, $name, $su, $unread, $total)
                    """);
                cmd.Parameters.AddWithValue("$aid", accountId);
                cmd.Parameters.AddWithValue("$full", f.FullName);
                cmd.Parameters.AddWithValue("$name", f.Name);
                cmd.Parameters.AddWithValue("$su", (object?)f.SpecialUse ?? DBNull.Value);
                cmd.Parameters.AddWithValue("$unread", f.UnreadCount);
                cmd.Parameters.AddWithValue("$total", f.TotalCount);
                cmd.ExecuteNonQuery();
            }
        }
    }

    public List<FolderInfo> GetFolders(int accountId)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT * FROM folder_cache WHERE account_id=$aid ORDER BY full_name");
            cmd.Parameters.AddWithValue("$aid", accountId);
            using var r = cmd.ExecuteReader();
            var list = new List<FolderInfo>();
            while (r.Read())
            {
                list.Add(new FolderInfo
                {
                    FullName = r.GetString(r.GetOrdinal("full_name")),
                    Name = r.GetString(r.GetOrdinal("name")),
                    SpecialUse = NullStr(r, "special_use"),
                    UnreadCount = r.GetInt32(r.GetOrdinal("unread_count")),
                    TotalCount = r.GetInt32(r.GetOrdinal("total_count")),
                });
            }
            return list;
        }
    }

    public void UpdateFolderUnread(int accountId, string folder, int unread)
    {
        lock (_lock)
        {
            using var cmd = Cmd("UPDATE folder_cache SET unread_count=$u WHERE account_id=$aid AND full_name=$f");
            cmd.Parameters.AddWithValue("$u", unread);
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$f", folder);
            cmd.ExecuteNonQuery();
        }
    }

    // ── Signatures ────────────────────────────────────────────

    public List<Signature> GetSignatures(int? accountId = null)
    {
        lock (_lock)
        {
            using var cmd = Cmd(accountId is null
                ? "SELECT * FROM signatures ORDER BY is_default DESC, id"
                : "SELECT * FROM signatures WHERE account_id IS NULL OR account_id=$aid ORDER BY is_default DESC, id");
            if (accountId is not null) cmd.Parameters.AddWithValue("$aid", accountId.Value);
            using var r = cmd.ExecuteReader();
            var list = new List<Signature>();
            while (r.Read()) list.Add(ReadSignature(r));
            return list;
        }
    }

    public int InsertSignature(Signature s)
    {
        lock (_lock)
        {
            if (s.IsDefault) ClearDefaultSignatures(s.AccountId);
            using var cmd = Cmd("""
                INSERT INTO signatures(name, content, is_default, account_id)
                VALUES($name, $content, $def, $aid);
                SELECT last_insert_rowid();
                """);
            cmd.Parameters.AddWithValue("$name", s.Name);
            cmd.Parameters.AddWithValue("$content", s.Content);
            cmd.Parameters.AddWithValue("$def", s.IsDefault ? 1 : 0);
            cmd.Parameters.AddWithValue("$aid", (object?)s.AccountId ?? DBNull.Value);
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public void UpdateSignature(Signature s)
    {
        lock (_lock)
        {
            if (s.IsDefault) ClearDefaultSignatures(s.AccountId);
            using var cmd = Cmd("""
                UPDATE signatures SET name=$name, content=$content, is_default=$def, account_id=$aid
                WHERE id=$id
                """);
            cmd.Parameters.AddWithValue("$name", s.Name);
            cmd.Parameters.AddWithValue("$content", s.Content);
            cmd.Parameters.AddWithValue("$def", s.IsDefault ? 1 : 0);
            cmd.Parameters.AddWithValue("$aid", (object?)s.AccountId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$id", s.Id);
            cmd.ExecuteNonQuery();
        }
    }

    public void DeleteSignature(int id)
    {
        lock (_lock)
        {
            using var cmd = Cmd("DELETE FROM signatures WHERE id=$id");
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
    }

    private void ClearDefaultSignatures(int? accountId)
    {
        using var cmd = Cmd(accountId is null
            ? "UPDATE signatures SET is_default=0 WHERE account_id IS NULL"
            : "UPDATE signatures SET is_default=0 WHERE account_id=$aid OR account_id IS NULL");
        if (accountId is not null) cmd.Parameters.AddWithValue("$aid", accountId.Value);
        cmd.ExecuteNonQuery();
    }

    private static Signature ReadSignature(SqliteDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("id")),
        Name = r.GetString(r.GetOrdinal("name")),
        Content = r.GetString(r.GetOrdinal("content")),
        IsDefault = r.GetInt32(r.GetOrdinal("is_default")) == 1,
        AccountId = r.IsDBNull(r.GetOrdinal("account_id")) ? null : r.GetInt32(r.GetOrdinal("account_id")),
    };

    // ── Image allowlist ───────────────────────────────────────

    public HashSet<string> GetImageAllowlist()
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT domain FROM image_allowlist");
            using var r = cmd.ExecuteReader();
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while (r.Read()) set.Add(r.GetString(0));
            return set;
        }
    }

    public void AllowImageDomain(string domain)
    {
        lock (_lock)
        {
            using var cmd = Cmd("INSERT OR IGNORE INTO image_allowlist(domain) VALUES($d)");
            cmd.Parameters.AddWithValue("$d", domain.ToLowerInvariant());
            cmd.ExecuteNonQuery();
        }
    }

    // ── Pending ops ───────────────────────────────────────────

    public int AddPendingOp(PendingOp op)
    {
        lock (_lock)
        {
            using var cmd = Cmd("""
                INSERT INTO pending_ops(account_id, folder, uid, op_type, payload_json)
                VALUES($aid, $folder, $uid, $type, $payload);
                SELECT last_insert_rowid();
                """);
            cmd.Parameters.AddWithValue("$aid", op.AccountId);
            cmd.Parameters.AddWithValue("$folder", op.Folder);
            cmd.Parameters.AddWithValue("$uid", (long)op.Uid);
            cmd.Parameters.AddWithValue("$type", op.OpType);
            cmd.Parameters.AddWithValue("$payload", (object?)op.PayloadJson ?? DBNull.Value);
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public void RemovePendingOp(int id)
    {
        lock (_lock)
        {
            using var cmd = Cmd("DELETE FROM pending_ops WHERE id=$id");
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
    }

    public List<PendingOp> GetPendingOps(int? accountId = null)
    {
        lock (_lock)
        {
            using var cmd = Cmd(accountId is null
                ? "SELECT * FROM pending_ops ORDER BY id"
                : "SELECT * FROM pending_ops WHERE account_id=$aid ORDER BY id");
            if (accountId is not null) cmd.Parameters.AddWithValue("$aid", accountId.Value);
            using var r = cmd.ExecuteReader();
            var list = new List<PendingOp>();
            while (r.Read())
            {
                list.Add(new PendingOp
                {
                    Id = r.GetInt32(r.GetOrdinal("id")),
                    AccountId = r.GetInt32(r.GetOrdinal("account_id")),
                    Folder = r.GetString(r.GetOrdinal("folder")),
                    Uid = (uint)r.GetInt64(r.GetOrdinal("uid")),
                    OpType = r.GetString(r.GetOrdinal("op_type")),
                    PayloadJson = NullStr(r, "payload_json"),
                });
            }
            return list;
        }
    }

    public HashSet<string> GetPendingKeys(int accountId, string folder)
    {
        lock (_lock)
        {
            using var cmd = Cmd("SELECT uid FROM pending_ops WHERE account_id=$aid AND folder=$folder");
            cmd.Parameters.AddWithValue("$aid", accountId);
            cmd.Parameters.AddWithValue("$folder", folder);
            using var r = cmd.ExecuteReader();
            var set = new HashSet<string>();
            while (r.Read()) set.Add($"{accountId}:{folder}:{r.GetInt64(0)}");
            return set;
        }
    }

    // ── Search ────────────────────────────────────────────────

    public List<CachedMessage> Search(SearchQuery q, int limit = 200)
    {
        lock (_lock)
        {
            var clauses = new List<string>();
            using var cmd = _conn.CreateCommand();

            if (q.AccountId is not null)
            {
                clauses.Add("account_id = $aid");
                cmd.Parameters.AddWithValue("$aid", q.AccountId.Value);
            }
            if (!string.IsNullOrWhiteSpace(q.Folder))
            {
                clauses.Add("folder = $folder");
                cmd.Parameters.AddWithValue("$folder", q.Folder);
            }
            if (!string.IsNullOrWhiteSpace(q.From))
            {
                clauses.Add("(from_address LIKE $from OR from_name LIKE $from)");
                cmd.Parameters.AddWithValue("$from", $"%{q.From}%");
            }
            if (q.HasAttachments == true)
            {
                clauses.Add("has_attachments = 1");
            }
            if (q.Since is not null)
            {
                clauses.Add("datetime(date) >= datetime($since)");
                cmd.Parameters.AddWithValue("$since", q.Since.Value.ToString("o"));
            }
            if (q.Before is not null)
            {
                clauses.Add("datetime(date) < datetime($before)");
                cmd.Parameters.AddWithValue("$before", q.Before.Value.ToString("o"));
            }

            var tokens = (q.Q ?? "")
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            for (var i = 0; i < tokens.Length; i++)
            {
                var t = tokens[i];
                var p = $"$t{i}";
                // Word-boundary-ish: short tokens only subject/from/to
                if (t.Length < 4)
                {
                    clauses.Add($"(subject LIKE {p} OR from_name LIKE {p} OR from_address LIKE {p} OR to_address LIKE {p})");
                    cmd.Parameters.AddWithValue(p, $"%{t}%");
                }
                else
                {
                    clauses.Add($"(subject LIKE {p} OR from_name LIKE {p} OR from_address LIKE {p} OR to_address LIKE {p} OR snippet LIKE {p} OR body_text LIKE {p})");
                    cmd.Parameters.AddWithValue(p, $"%{t}%");
                }
            }

            var where = clauses.Count > 0 ? "WHERE " + string.Join(" AND ", clauses) : "";
            cmd.CommandText = $"""
                SELECT * FROM mail_cache {where}
                ORDER BY
                  CASE WHEN subject LIKE $boost OR from_name LIKE $boost THEN 0 ELSE 1 END,
                  datetime(date) DESC
                LIMIT $limit
                """;
            cmd.Parameters.AddWithValue("$boost", tokens.Length > 0 ? $"%{tokens[0]}%" : "%");
            cmd.Parameters.AddWithValue("$limit", limit);

            using var r = cmd.ExecuteReader();
            var list = new List<CachedMessage>();
            while (r.Read()) list.Add(ReadMessage(r));
            return list;
        }
    }
}
