fetch('http://localhost:5000/api/hello')
  .then(res => res.json())
  .then(data => console.log(data));