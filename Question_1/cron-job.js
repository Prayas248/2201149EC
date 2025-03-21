const cron = require('node-cron');
const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

// Function to trigger heap creation
async function triggerHeapCreation(endpoint) {
    try {
        console.log(`Triggering heap creation: ${endpoint}`);
        const response = await axios.get(`${SERVER_URL}${endpoint}`);
        console.log(`Heap creation successful: ${response.data.message}`);
    } catch (error) {
        console.error(`Error triggering ${endpoint}:`, error.message);
    }
}



// 30 seconds interval for user heap
cron.schedule('*/30 * * * *', async () => {
    console.log('Running User Heap Update Job...');
    await triggerHeapCreation('/create-user-heap');
}, {
    scheduled: true,
    timezone: "Asia/Kolkata" 
});





// 15 minutes for popular post heap
cron.schedule('*/15 * * * *', async () => {
    console.log('Running Post Heap Update Job...');
    await triggerHeapCreation('/create-post-heap');
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

console.log('Cron jobs scheduled. Running in the background in IST timezone...');
