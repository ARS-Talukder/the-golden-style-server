const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

const port = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send('The node is Created');
});

app.listen(port, () => {
    console.log('The Port is Running nicely', port);
})