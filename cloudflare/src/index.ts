// Scheduler only. Heavy market computations run in authenticated Next.js Node functions.
interface Env { TRAPEROS_WORKER_URL: string; CRON_SECRET: string; }
export default {
 async scheduled(_event: ScheduledEvent,env:Env,ctx:ExecutionContext){
   ctx.waitUntil((async()=>{
     if(!env.TRAPEROS_WORKER_URL.startsWith('https://')||env.CRON_SECRET.length<24)
       throw new Error('Missing secure cron environment');
     const response=await fetch(env.TRAPEROS_WORKER_URL,{method:'POST',
       headers:{Authorization:'Bearer '+env.CRON_SECRET,'Content-Type':'application/json'},
       body:'{}',signal:AbortSignal.timeout(25000)});
     if(!response.ok)throw new Error('TraperOS scheduler endpoint returned '+response.status);
   })());
 },
 async fetch():Promise<Response>{return new Response('TraperOS scheduler. No public trigger.',{status:404});}
};
