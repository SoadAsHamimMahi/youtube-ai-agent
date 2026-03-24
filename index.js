require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { getTopAIVideos } = require("./services/youtube");
const { sendEmail } = require("./services/mail");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use Service Role Key if available to bypass RLS, otherwise fallback to Anon key for backward compatibility
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Fatal Error: Supabase credentials missing (SUPABASE_URL or SUPABASE_KEY)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Checks if the agent should run in the current hour.
 * Assumes agent.preferred_time is HH:mm:ss
 */
function shouldAgentRunNow(agent) {
  try {
    const tz = agent.timezone || "Asia/Dhaka";
    const now = new Date();
    
    // Skip the "Already ran" check if this is a manual trigger (Force run)
    const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.env.FORCE_RUN === 'true';

    if (!isManual && agent.last_run_at) {
      const lastRun = new Date(agent.last_run_at);
      const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
      
      // If it already ran successfully in the last 18 hours, we skip to avoid double-mailing
      if (hoursSinceLastRun < 18) {
        console.log(`   ⏭️ Already sent an email for today [${agent.title}] (${Math.round(hoursSinceLastRun)}h ago). Skipping.`);
        return false;
      }
    }

    // Get current hour and minute in agent's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      timeZone: tz
    });
    
    const parts = formatter.formatToParts(now);
    const localHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const localMinute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    
    // Extract preferred hour and minute (e.g., "17:30:00")
    const [prefH, prefM] = agent.preferred_time.split(":");
    const preferredHour = parseInt(prefH, 10);
    const preferredMinute = parseInt(prefM, 10);
    
    console.log(`   🕒 Time Check [${agent.title}]: Local: ${localHour}:${localMinute}, Goal: ${preferredHour}:${preferredMinute} (${tz})`);
    
    // Check for an exact hour match and a "close enough" minute match (within 5 mins)
    // This allows for slight GitHub Action delays while still being precise.
    const isCorrectHour = localHour === preferredHour;
    const isCorrectMinute = Math.abs(localMinute - preferredMinute) <= 5;
    
    return isCorrectHour && isCorrectMinute;
  } catch (e) {
    console.error(`   ❌ Timezone logic error for ${agent.title}:`, e.message);
    return false; 
  }
}

async function runAgent(agent) {
  console.log(`\n🤖 Processing Agent: "${agent.title}"`);
  
  // Only check time if we are running via automated scheduler (cron)
  // If run-monitor is triggered manually (workflow_dispatch), we run all active.
  const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.env.FORCE_RUN === 'true';
  
  if (!isManual && !shouldAgentRunNow(agent)) {
    console.log(`   ⏭️ Not the preferred time yet. Skipping.`);
    return;
  }

  console.log(`   📧 Target: ${agent.recipient_email}`);
  const queries = agent.queries || [];
  console.log(`   🏷️ Queries: ${queries.join(", ")}`);

  try {
    const videos = await getTopAIVideos(queries, agent.max_videos || 10);

    if (!videos || videos.length === 0) {
      console.log(`   ⚠️ No videos found for "${agent.title}". Skipping email.`);
      await supabase
        .from("monitoring_configs")
        .update({ last_run_at: new Date().toISOString(), last_run_status: 'success' })
        .eq("id", agent.id);
      return;
    }

    await sendEmail(videos, agent.recipient_email, agent.title);
    
    await supabase
      .from("monitoring_configs")
      .update({ last_run_at: new Date().toISOString(), last_run_status: 'success' })
      .eq("id", agent.id);

    console.log(`   ✅ Agent "${agent.title}" complete.`);
  } catch (error) {
    console.error(`   ❌ Error processing agent "${agent.title}":`, error.message);
    await supabase
      .from("monitoring_configs")
      .update({ last_run_at: new Date().toISOString(), last_run_status: 'error' })
      .eq("id", agent.id);
  }
}

async function main() {
  console.log("🚀 YouTube AI SaaS — Starting Monitor Scan...");
  console.log(`🕒 System Time: ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  try {
    const { data: agents, error } = await supabase
      .from("monitoring_configs")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;
    console.log(`📊 Total Active Agents fetched from DB: ${agents?.length || 0}`);

    if (!agents || agents.length === 0) {
      console.log("ℹ️ No active agents found in database query.");
      return;
    }

    for (const agent of agents) {
      await runAgent(agent);
    }

    console.log("\n✅ Batch run complete!");
  } catch (error) {
    console.error("\n❌ Fatal Error:");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
