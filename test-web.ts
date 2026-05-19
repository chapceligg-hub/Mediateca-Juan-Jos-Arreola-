const testRoute = async () => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "google/gemma-3-12b-it:free",
            messages: [{role: "user", content: "Who won the oscars in 2024?"}],
            plugins: [{id: "web"}]
        })
    });
    console.log(await res.text());
};
testRoute();
