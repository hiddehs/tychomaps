const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Function to append search data to a log file
function logSearch(query) {
    const filePath = path.join(__dirname, 'searchLogs.json'); // Define the path of your log file
    const data = { query, timestamp: new Date() };

    // Read the current data file and append the new search
    fs.readFile(filePath, (err, content) => {
        let searches = [];
        if (!err) {
            searches = JSON.parse(content.toString()); // Convert the existing JSON string back to an object
        }
        searches.push(data);

        // Write the updated searches back to the file
        fs.writeFile(filePath, JSON.stringify(searches, null, 2), err => {
            if (err) {
                console.error('Error writing to file', err);
            }
        });
    });
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { query } = req.body;
    if (!query || query.length > 128) {
        return res.status(400).json({ error: "Invalid query length" });
    }

    try {
        logSearch(query); // Log the search query

        // OpenAI API Call
        const aiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "user",
                    content: `You modify this url so it will help people search for places. Change the query to how you think it will help the user find unique local and cozy places. Try to add max 2 extra filters. If someone enters a street, try to change it to the area or even the city.

                    Example 1 query: "canal saint-martin vegetarian dinner"
                      
                    Paris+végétarien+Dîner+indépendant
                    
                    Example 2 query:"koffie funenpark"
                    
                    amsterdam-oost+koffie+havermelk+gezellig
                    
                    Example 3: "petit dejeuner berlijn"
                    
                    fruhstuck+berlin+hipster+klein
                    
                    Example 4: "go out in tbilisi"
                    
                    tbilisi+nightclub+local+unique
                    
                    Only reply with the query response. nothing else. Your response is a part of a URL that depends on you. If you can't respond, or the users query is invalid, respond with "INVALID" If you think it is a query to search in China, reply only with "NOGOOGLEMAPS"
                    
                    You can do it! The query is: ${query}`
                }],
                temperature: 0.7
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );



        if (aiResponse.data.choices && aiResponse.data.choices.length > 0) {
            const mapsQuery = aiResponse.data.choices[0].message.content.trim();

            // Google Places API Call with POST
            const mapsResponse = await axios.post(
                'https://places.googleapis.com/v1/places:searchText',
                {
                    textQuery: mapsQuery,
                    minRating: 4.5
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
                        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri'
                    }
                }
            );

            if (mapsResponse.data && mapsResponse.data.places) {
                const sortedPlaces = mapsResponse.data.places.sort((a, b) => b.rating - a.rating).slice(0, 5);
                res.status(200).json({ places: sortedPlaces });
            } else {
                res.status(404).json({ error: 'No places found' });
            }
        } else {
            res.status(500).json({ error: 'No valid response from AI' });
        }
    } catch (error) {
        console.error('API request failed:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};
