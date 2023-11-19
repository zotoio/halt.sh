import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const { OPENAI_API_KEY, NEWS_API_KEY, PORT = 3000, FREQUENCY = 'daily', PAGE_SIZE = 1, PAGE_COUNT = 1, SINGLE_RANDOM = 'true', CACHE = 'true' } = process.env;

const cacheDir = '/home/root/cache';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const keywords = ['chatgpt', 'midjourney', 'dall-e', 'openai', 'genai', 'generative ai', 'copilot'];

const isWeekend = () => {
    const currentDate = new Date();
    return currentDate.getDay() === 6 || currentDate.getDay() === 0;
};

// if it's the weekend, increase the page count by 3
let pageCount = PAGE_COUNT;
if (isWeekend()) {
    pageCount = pageCount * 3;
}

const fetchAiNews = async () => {
    let result = [];
    for (let i = 1; i <= pageCount; i++) {
        const response = await axios.get('https://api.thenewsapi.com/v1/news/top', {
            params: {
                search: keywords.join('|'),
                sort: 'published_at',
                api_token: NEWS_API_KEY,
                language: 'en',
                limit: PAGE_SIZE,
                page: i
            },
        });
        result.push(...response.data.data);
    }
    if (SINGLE_RANDOM === 'true') result = result[Math.floor(Math.random() * result.length)];
    console.log(result);
    return [result];
};

const authorPrompt = `give me a json object containing a single array called authors of 30 famous peoples names, with each as a json object. 
  each object should have a field called 'name' containing the real name, and a second 
  field called 'alias' should contain a playful anagram based alternative name of that persons name. 
  Each alias anagram should sound as plausible as a persons name as possible
  and your entire response MUST pe parsable by the JSON.parse() function in javascript`;

let authors = null;
const getAuthor = async () => {
    if (authors == null) {
        const authorsResponse = await aiJSONResponse(authorPrompt);
        console.log(authorsResponse);
        authors = JSON.parse(authorsResponse).authors;
    }

    const randomIndex = Math.floor(Math.random() * authors.length);
    return authors[randomIndex];
};

const aiJSONResponse = async (prompt) => {
    const chatCompletion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-1106',
        response_format: {type: 'json_object'},
        messages: [{ role: 'user', content: prompt }]
    });
    console.log(chatCompletion.choices);
    return chatCompletion.choices[0].message.content;
};

const aiResponse = async (prompt) => {
    const chatCompletion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }]
    });
    console.log(chatCompletion.choices);
    return chatCompletion.choices[0].message.content;
};

app.get('/editorials', async (req, res) => {
    const currentDate = new Date();

    let defaultCacheKey;
    let cacheKey;
    
    if (FREQUENCY === 'daily') {
        defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-99`;
    } else if (FREQUENCY === 'hourly') {
        defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-${padNumber(currentDate.getHours())}`;
    }

    cacheKey = defaultCacheKey;

    // Ensure the cache directory exists
    if (!fs.existsSync(cacheDir || !fs.existsSync(`${cacheDir}/images`))) {
        fs.mkdirSync(cacheDir);
        fs.mkdirSync(`${cacheDir}/images`);
    }
    let cacheFilePath;
    cacheFilePath = `${path.join(cacheDir, defaultCacheKey)}.json`;

    let suppliedCacheKey = req.query.cacheKey;
    // if the suppliedcachekey includes the hour and the frequency is daily, remove the hour
    if (FREQUENCY === 'daily' && suppliedCacheKey && suppliedCacheKey.length > 10) {
        suppliedCacheKey = suppliedCacheKey.substring(0, 10) + '-99';
    }
    const isValidCacheKey = suppliedCacheKey && /^[0-9-]+$/.test(suppliedCacheKey);

    if (isValidCacheKey) {
        let suppliedCacheFilePath = `${path.join(cacheDir, suppliedCacheKey)}.json`;
        if (fs.existsSync(suppliedCacheFilePath)) {
            cacheKey = suppliedCacheKey;
            cacheFilePath = suppliedCacheFilePath;
        }
    } else {
        console.error('Invalid cache key', suppliedCacheKey);
    }
    console.log(cacheFilePath);

    if (CACHE === 'true' && fs.existsSync(cacheFilePath)) {
        // Cache file exists, read and return the cached data
        const cachedData = fs.readFileSync(cacheFilePath, 'utf8');
        console.log('content loaded from cache'); 
        if (cachedData != null) {
            let data = JSON.parse(cachedData)
            data[0].navigation = getNextAndPreviousFilenames(cacheKey)
            return res.json(data);
        }
    }
    try {
        console.log('no cached content'); 
        const articles = await fetchAiNews();
        const editorials = [];
        for (const article of articles) {
            const author = await getAuthor();
            const prompt = `Using the html h3 tag with text-align left for the title and an html p tag for the rest, write a 100 word summary of the 
              following news article: ${article.url} with an amusing title.  Only one title and two 50 word paragraphs 
              can be created, and it can use inline css to make it eye-catching, with liberal use of emojis and comic sans. 
              write it sounding like a famous person named ${author.name}.  include the byline as ${author.name} following the title in bold italics.`;
            try {
                let editorial = await aiResponse(prompt);
                editorial += `<span style='display:none'>${author.name}</span>`;
                const imagePrompt = `${author.name} in a scene about ${article.title}`;
                const imageResponse = await generateImage(imagePrompt);
                article.image_url = CACHE === 'true' ? imageResponse.data[0].localUrl : imageResponse.data[0].url;
                article.authorAlias = author.alias;
                editorials.push({ article, editorial });

            } catch (error) {
                console.error(error);
            }
        }
        if (CACHE === 'true') {
            fs.writeFileSync(cacheFilePath, JSON.stringify(editorials));
        }    
        editorials[0].navigation = getNextAndPreviousFilenames(cacheKey)
        res.json(editorials);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while generating editorials.' });
    }
});

const generateImage = async (prompt) => {
    let response;
    try {
        response = await openai.images.generate({ model: 'dall-e-3', prompt });
        
    } catch (error) {
        console.error(`imageGen: ${error}`);
        const fallbackPrompt = `Anonymous hackers mutating a scene related to ${prompt}`;
        response = await openai.images.generate({ model: 'dall-e-3', prompt: fallbackPrompt });
    }

    if (CACHE === 'true') {
        response = saveImageToFile(response);
    }    
    return response;
};

const saveImageToFile = async (response) => {
    const { url } = response.data[0];
    const urlHash = crypto.createHash('sha256').update(url).digest('hex'); 
    let res = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data, 'binary');
    const currentDate = new Date();
    const cacheKey = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}-${currentDate.getHours()}-${urlHash}`;
    const cacheFilePath = `${path.join(cacheDir, 'images', cacheKey)}.png`;
    console.log(cacheFilePath);
    fs.writeFileSync(cacheFilePath, buffer);
    response.data[0].localUrl = `/cache/images/${cacheKey}.png`;
    return response;

}

function parseFilename(filename) {
    const match = filename.match(/(\d{4}-\d{2}-\d{2})(-\d{2})?\.json$/);
    if (!match) return null;

    const dateStr = match[1];
    const hourStr = match[2] ? match[2].substring(1) : '99';
    return `${dateStr}-${hourStr}`;
}

function getNextAndPreviousFilenames(currentFilename) {
    console.log(`currentFilename: ${currentFilename}`);
    const files = fs.readdirSync(cacheDir);
    console.log(`files: ${files}`);

    const dates = files
        .map(parseFilename)
        .filter(date => date !== null)
        .sort((a, b) => a - b).reverse();

    console.log(`dates: ${dates}`);

    const currentIndex = dates.findIndex(date => date.startsWith(currentFilename.substring(0, 13)));
    console.log(`currentIndex: ${currentIndex}`);
    if (currentIndex === -1) {
        return { next: null, previous: null };
    }

    const nextIndex = currentIndex + 1 < dates.length ? currentIndex + 1 : null;
    const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : null;

    const nextFile = nextIndex !== null ? dates[nextIndex] : null;
    const prevFile = prevIndex !== null ? dates[prevIndex] : null;

    let result = { next: nextFile, previous: prevFile }
    return result;
}

function padNumber(number) {
    return number < 10 ? '0' + number : number.toString();
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
