console.log("GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
console.log("Starts with:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : 'null');
