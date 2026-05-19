async function run() {
  const result = await fetch("http://localhost:3000/api/test-env");
  const data = await result.json();
  console.log("TEST-ENV:", data);
}
run();
