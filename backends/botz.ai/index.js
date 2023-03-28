require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const newsApiKey = process.env.NEWS_API_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;

const keywords = ['chatgpt', 'midjourney', 'dall-e', 'openai'];
const query = keywords.join(' OR ');

const fetchAiNews = async () => {
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      q: query,
      sortBy: 'publishedAt',
      apiKey: newsApiKey,
      language: 'en',
      pageSize: 5,
      page: 1
    },
  });
  //console.log(response.data.articles);
  return response.data.articles;
};

const generateEditorial = async (prompt) => {
  const response = await axios.post(
    'https://api.openai.com/v1/completions',
    {
      prompt,
      max_tokens: 500,
      model: 'text-davinci-003'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`,
      },
    }
  );
  return response.data.choices[0].text;
};

app.get('/editorials', async (req, res) => {
  try {
    const articles = await fetchAiNews();
    const editorials = [];

    for (const article of articles) {
      const prompt = `Using the html h3 tag for the title and p tags for each paragraph, write an article on the 
                        following news article: ${article.url} with a creative title.  The article should
                        capture the key facts and analyse each on it's merits.`;
      const editorial = await generateEditorial(prompt);
      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      console.log(article);
      console.log('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
      console.log(editorial);
      editorials.push({ article, editorial });
    }
    console.log('=====================================================================================');
    //console.log(editorials);
    
    res.json(editorials);
  
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while generating editorials.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
