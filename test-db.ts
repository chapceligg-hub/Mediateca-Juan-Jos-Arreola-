import { createClient } from "@insforge/sdk";
const ins = createClient({
  baseUrl: "https://razyk54r.us-west.insforge.app",
  anonKey: "ik_8d53a92b373f80470bd95201a42c4715"
});
ins.database.from("movies").select("*").limit(5).then(x => console.log("success:", !!x.data, "len:", x.data?.length, "error:", x.error));
