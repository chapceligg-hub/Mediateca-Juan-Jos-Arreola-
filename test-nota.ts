async function test() {
  try {
    const response = await fetch('http://localhost:3000/api/batch-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "🎬 Dirección: Parkpoom Wongpoom, codirector del filme (Nota de consistencia: El registro crudo cita a Parkpoom Wongpoom, codirector del filme) \n🎬 Título Español: ⚠️ Gladiador" })
    });
    const data = await response.text();
    console.log("RESPONSE:", data);
  } catch (err) {
    console.error(err);
  }
}
test();
