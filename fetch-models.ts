async function fetchModels() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const data = await res.json();
  const freeModels = data.data.filter((m: any) => m.id.includes("free"));
  console.log(freeModels.map((m: any) => m.id).join("\n"));
}
fetchModels();
