-- Enable Supabase Cron, pg_net, Vault. Run after migration and Vercel deployment.
-- Create secrets privately in Supabase Vault:
-- metals_app_url: https://YOUR-PRODUCTION-DOMAIN.vercel.app
-- metals_cron_secret: same random CRON_SECRET as Vercel
-- Optional metals_vercel_bypass: Vercel protection-bypass secret if protection is enabled.
select cron.schedule('metals-watch-minute-tick','* * * * *',$job$
 select net.http_post(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='metals_app_url'),'/')||'/api/cron',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization',
   'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='metals_cron_secret'))
   || coalesce((select jsonb_build_object('x-vercel-protection-bypass',decrypted_secret)
       from vault.decrypted_secrets where name='metals_vercel_bypass'),'{}'::jsonb),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 );
$job$);
-- Same job name updates the schedule. Disable with:
-- select cron.unschedule('metals-watch-minute-tick');
-- Verify both cron dispatch and HTTP outcome:
-- select * from cron.job_run_details order by start_time desc limit 10;
-- select id,status_code,timed_out,error_msg from net._http_response order by id desc limit 10;
