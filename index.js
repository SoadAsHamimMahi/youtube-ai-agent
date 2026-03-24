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
    
    // Get current time in agent's timezone
    const nowLocal = new Date().toLocaleString("en-US", { timeZone: tz });
    const localHour = new Date(nowLocal).getHours();
    
    // Extract hour from preferred_time (e.g., "04:20:00" -> 4)
    const preferredHour = parseInt(agent.preferred_time.split(":")[0], 10);
    
    console.log(`   🕒 Time Check [${agent.title}]: Current Local Hour: ${localHour}, Preferred: ${preferredHour} (${tz})`);
    
    return localHour === preferredHour;
  } catch (e) {
    console.error(`   ❌ Timezone error for ${agent.title}:`, e.message);
    return true; // Fallback to run if timezone is invalid
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
  console.log("🚀 YouTube AI SaaS — Starting Hourly Monitor Run...");
  console.log("=".repeat(50));

  try {
    const { data: agents, error } = await supabase
      .from("monitoring_configs")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;
    if (!agents || agents.length === 0) {
      console.log("ℹ️ No active agents found.");
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
