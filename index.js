require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { getTopAIVideos } = require("./services/youtube");
const { sendEmail } = require("./services/mail");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function runAgent(agent) {
  console.log(`\n🤖 Processing Agent: "${agent.title}"`);
  console.log(`   📧 Target: ${agent.recipient_email}`);
  console.log(`   🏷️ Queries: ${agent.queries.join(", ")}`);

  try {
    const videos = await getTopAIVideos(agent.queries, agent.max_videos || 10);

    if (!videos || videos.length === 0) {
      console.log(`   ⚠️ No videos found for "${agent.title}". Skipping.`);
      // Still update success since the search itself didn't fail
      await supabase
        .from("monitoring_configs")
        .update({ 
          last_run_at: new Date().toISOString(),
          last_run_status: 'success' 
        })
        .eq("id", agent.id);
      return;
    }

    await sendEmail(videos, agent.recipient_email, agent.title);
    
    // Update Supabase with success
    await supabase
      .from("monitoring_configs")
      .update({ 
        last_run_at: new Date().toISOString(),
        last_run_status: 'success' 
      })
      .eq("id", agent.id);

    console.log(`   ✅ Agent "${agent.title}" complete.`);
  } catch (error) {
    console.error(`   ❌ Error processing agent "${agent.title}":`, error.message);
    
    // Update Supabase with error
    await supabase
      .from("monitoring_configs")
      .update({ 
        last_run_at: new Date().toISOString(),
        last_run_status: 'error' 
      })
      .eq("id", agent.id);
  }
}

async function main() {
  console.log("🚀 YouTube AI SaaS — Starting Batch Monitor Run...");
  console.log("=".repeat(50));

  try {
    // Step 1: Fetch all active monitoring configs
    const { data: agents, error } = await supabase
      .from("monitoring_configs")
      .select("*")
      .eq("is_active", true);

    if (error) throw error;

    if (!agents || agents.length === 0) {
      console.log("ℹ️ No active agents found in the database.");
      return;
    }

    console.log(`📦 Found ${agents.length} active agents to process.`);

    // Step 2: Run them sequentially (to avoid rate limits/quota issues)
    for (const agent of agents) {
      await runAgent(agent);
    }

    console.log("\n✅ All agents processed!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Fatal Error in Batch Run:");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
