const m = { genre: "Drama / Intriga" };
const str = String(m.genre);
const parts = str.split(/\s*[\/,\|]\s*|\s+-\s+| y /);
console.log(parts);
