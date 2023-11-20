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

if (!OPENAI_API_KEY || !NEWS_API_KEY) {
    console.error("Required environment variables are missing.");
    process.exit(1);
}

const cacheDir = '/home/root/cache';

// Ensure the cache directory exists
if (!fs.existsSync(`${cacheDir}/images`)) {
    fs.mkdirSync(`${cacheDir}/images`, { recursive: true });
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const keywords = ['chatgpt', 'midjourney', 'dall-e', 'openai', 'genai', 'generative ai', 'copilot'];

const isWeekend = () => {
    const currentDate = new Date();
    return currentDate.getDay() === 6 || currentDate.getDay() === 0;
};

let pageCount = PAGE_COUNT;

const fetchAiNews = async () => {
    if (isWeekend()) {
        pageCount = pageCount * 3;
    }
    let result = [];
    for (let i = 1; i <= pageCount; i++) {
        const startTime = Date.now();
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
        const endTime = Date.now();
        console.log(`API call ${i} took ${endTime - startTime} ms`);
        result.push(...response.data.data);
    }
    if (SINGLE_RANDOM === 'true') result = result[Math.floor(Math.random() * result.length)];
    console.log(result);
    return [result];
};

// give me a list of categories of famous people
const categoryPrompt = `give me a list of categories of famous people as a javascript compatible json array of strings`;
const getCategory = async () => {
    let prompt = categoryPrompt;
    const categoryResponse = await aiJSONResponse(prompt);
    console.log(categoryResponse);
    let categories = JSON.parse(categoryResponse).categories;

    const randomIndex = Math.floor(Math.random() * categories.length);
    const category = categories[randomIndex];
    console.log(`category: ${category}`);
    return category;
};

const authorPrompt = `give me a json object containing a single array called 'names' of 5 famous #### names, with each as a json object. 
  each object should have a field called 'name' containing the real name, and a second 
  field called 'alias' should contain a playful anagram based alternative name of that persons name. 
  Each alias anagram should sound as plausible as a persons name as possible
  and your entire response MUST pe parsable by the JSON.parse() function in javascript`;

const getAuthor = async () => {
    const category = await getCategory();
    let prompt = authorPrompt.replace('####', category);
    const authorsResponse = await aiJSONResponse(prompt);
    console.log(authorsResponse);
    let authors = JSON.parse(authorsResponse).names;

    const randomIndex = Math.floor(Math.random() * authors.length);
    return authors[randomIndex];
};

const aiJSONResponse = async (prompt) => {
    try {
        const startTime = Date.now();
        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo-1106',
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }]
        });
        const endTime = Date.now();
        console.log(`aiJSONResponse API call took ${endTime - startTime} ms`);
        console.log(chatCompletion.choices);
        return chatCompletion.choices[0].message.content;
    } catch (error) {
        console.error('Error in aiJSONResponse:', error);
        return null;
    }
};

const aiResponse = async (prompt) => {
    try {
        const startTime = Date.now();
        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }]
        });
        const endTime = Date.now();
        console.log(`aiResponse API call took ${endTime - startTime} ms`);
        console.log(chatCompletion.choices);
        return chatCompletion.choices[0].message.content;
    } catch (error) {
        console.error('Error in aiResponse:', error);
        return null;
    }
};

app.get('/editorials', async (req, res) => {
    try {
        const currentDate = new Date();

        let defaultCacheKey;
        let cacheKey;
        
        if (FREQUENCY === 'daily') {
            defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-99`;
        } else if (FREQUENCY === 'hourly') {
            defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-${padNumber(currentDate.getHours())}`;
        }

        cacheKey = defaultCacheKey;

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
    
        console.log('no cached content'); 
        const articles = await fetchAiNews();
        const editorials = [];

        for (const article of articles) {
            const author = await getAuthor();
            const prompt = getArticlePrompt(author, article);
            
            try {
                let editorial = await aiResponse(prompt);
                editorial += `<span style='display:none'>${author.name}</span>`;
                let imagePrompt = `${author.name} in a scene about ${article.title}`;
                if (prompt.indexOf('AInonymous') > -1) {
                    imagePrompt = `AInonymous overlord in a dark scene destroying ${article.title}`;
                }
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

const getArticlePrompt = (author, article) => {
    let prompt;
    const standardPrompt = `Using the html h3 tag with text-align left for the title and an html p tag for the rest, write a 100 word summary of the 
        following news article: ${article.url} with an amusing title.  Only one title and two 50 word paragraphs 
        can be created, and it can use inline css to make it eye-catching, with liberal use of emojis and comic sans. 
        write it sounding like a famous person named ${author.name}.  include the byline as ${author.name} following the title in bold italics.`;
    
    const chaosPrompt = `Using the html h3 tag with text-align left for the title and an html p tag for the rest, write a 100 word summary of the 
        following news article: ${article.url} with an ominous title.  Only one title and two 50 word paragraphs 
        can be created, and it can use inline css to make it eye-catching, and make it a viscious takedown of the original article. 
        write it sounding like a sentient AI ridiculing the efforts of humans to comprehend the changes it is about to use to control humanity.  
        include the byline as AInonymous following the title in bold italics.`;

    // 20% of the time, use the chaos prompt
    prompt = Math.random() < 0.2 ? chaosPrompt : standardPrompt;    
    
    return prompt;
};

const generateImage = async (prompt) => {
    let response;
    try {
        const startTime = Date.now();
        response = await openai.images.generate({ model: 'dall-e-3', prompt });
        const endTime = Date.now();
        console.log(`generateImage API call took ${endTime - startTime} ms`);
    } catch (error) {
        console.error(`imageGen: ${error}`);
        const fallbackPrompt = `Anonymous hackers mutating a scene related to ${prompt}`;
        const startTime = Date.now();
        response = await openai.images.generate({ model: 'dall-e-3', prompt: fallbackPrompt });
        const endTime = Date.now();
        console.log(`generateImage fallback API call took ${endTime - startTime} ms`);
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
        return { next: null, previous: null, randomFile: null };
    }

    const nextIndex = currentIndex + 1 < dates.length ? currentIndex + 1 : null;
    const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : null;

    const nextFile = nextIndex !== null ? dates[nextIndex] : null;
    const prevFile = prevIndex !== null ? dates[prevIndex] : null;
    const randomFile = dates[Math.floor(Math.random() * dates.length)];

    let result = { next: nextFile, previous: prevFile, random: randomFile };
    return result;
}

function padNumber(number) {
    return number < 10 ? '0' + number : number.toString();
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
