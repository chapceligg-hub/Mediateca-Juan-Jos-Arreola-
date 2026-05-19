const url = "https://razyk54r.us-west.insforge.app/rest/v1/movies?select=*&limit=5";
fetch(url, {
  headers: {
    "apikey": "ik_8d53a92b373f80470bd95201a42c4715",
    "Authorization": "Bearer ik_8d53a92b373f80470bd95201a42c4715"
  }
}).then(res => res.json()).then(data => console.log(JSON.stringify(data).substring(0, 500))).catch(err => console.error(err));
