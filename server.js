const express = require('express');
const path = require('path');
const analyzeRoute = require('./api/analyze');

const app = express();
app.use(express.static('public'));
app.use('/api', analyzeRoute);

app.listen(3000, () => {
    console.log('🚀 Server running on http://localhost:3000');
});