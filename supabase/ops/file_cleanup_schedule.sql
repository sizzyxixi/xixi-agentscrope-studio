-- Apply after the production cleanup endpoint is deployed and FILE_CLEANUP_SECRET
-- is configured both in Vercel and as the Vault secret xixi_file_cleanup_secret.
-- No user credentials or storage service keys are included in the scheduled SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- HTTP queue rows contain decrypted request headers until delivery. Keep them
-- inaccessible to browser roles, including permissions inherited from PUBLIC.
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('xixi-file-retention-cleanup', '* * * * *', $job$
SELECT net.http_post(
    url := 'https://xixi.rest/internal/files/cleanup',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='xixi_file_cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
)
WHERE EXISTS (SELECT 1 FROM agentscope.file_cleanup)
   OR EXISTS (
       SELECT 1 FROM agentscope.studio_files
       WHERE deleted_at IS NULL AND (
           expires_at::timestamptz <= now()
           OR created_at::timestamptz + CASE WHEN origin='artifact' THEN interval '7 days' ELSE interval '3 days' END <= now()
       )
   );
$job$);
