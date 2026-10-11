fetch('https://e-backend-rust.vercel.app/api/health')
  .then(res => res.json())
  .then(data => console.log(data));