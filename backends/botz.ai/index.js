import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import curlirize from 'axios-curlirize';
import cheerio from 'cheerio';

curlirize(axios);

dotenv.config();

const {
    OPENAI_API_KEY,
    NEWS_API_KEY,
    PORT = 3000,
    FREQUENCY = 'daily',
    PAGE_SIZE = 1,
    PAGE_COUNT = 1,
    SINGLE_RANDOM = 'true',
    CACHE = 'true',
    CATEGORY_HOURS = 1,
    CACHE_DIR = '/var/lib/cache',
    SHARED_SECRET
} = process.env;

if (!OPENAI_API_KEY || !NEWS_API_KEY || !SHARED_SECRET) {
    console.error("Required environment variables are missing.");
    process.exit(1);
}

const cacheDir = CACHE_DIR;

// Ensure the cache directory exists
if (!fs.existsSync(`${cacheDir}/images`)) {
    fs.mkdirSync(`${cacheDir}/images`, { recursive: true });
}

const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const keywords = ['llm', 'sora', 'chatgpt', 'chatgpt%20pro', 'midjourney', 'dall-e', 'openai', 'genai', 'generative%20ai', 'copilot', 'google%20gemini', 'gemini%201.5', 'gemini%20pro', 'google%20gemma', 'bard', 'gpt-3', 'gpt-4', 'gpt', 'gpt-4o', 'hugging%20face', 'meta%20llama'];

const isWeekend = () => {
    const currentDate = new Date();
    return currentDate.getDay() === 6 || currentDate.getDay() === 0;
};

const fetchAiNews = async (req) => {
    let articleUrl = req.query.articleUrl;
    let result = [];
    if (authorisedAdminRequest(req) && articleUrl) {
        console.log(`admin using supplied article url: ${articleUrl}`);

        let articleUrlHostname = new URL(articleUrl).hostname;
        let randomDateInLast3days = new Date(Date.now() - getRandomInt(0, 259200000));

        const articleHtml = await axios.get(articleUrl);
        const html = articleHtml.data;

        // Use Cheerio to parse the HTML
        const $ = cheerio.load(html);
        result = {
            url: articleUrl,
            title: $('title').text(),
            source: articleUrlHostname,
            published_at: randomDateInLast3days
        };
        console.log(result);
        return [result];
    }     

    let pageCount = PAGE_COUNT;
    if (isWeekend()) {
        pageCount = pageCount * 2; // double the number of pages on weekends
    }
    
    for (let i = 1; i <= pageCount; i++) {
        let keywordsShuffled = keywords.sort(() => Math.random() - 0.5); // Shuffle the keywords
        let randomPage = getRandomInt(1, 5);
        const startTime = Date.now();
        const response = await axios.get('https://api.thenewsapi.com/v1/news/top', {
            params: {
                search: keywordsShuffled.join('|'),
                sort: 'published_at',
                api_token: NEWS_API_KEY,
                language: 'en',
                limit: PAGE_SIZE,
                page: randomPage,
            },
        });
        const endTime = Date.now();
        console.log(`API call ${i} took ${endTime - startTime} ms`);
        result.push(...response.data.data);
        //console.log(result);
    }
    if (SINGLE_RANDOM === 'true') result = result[getRandomInt(0, result.length-1)]; //Math.floor(Math.random() * result.length)];
    console.log(result);
    return [result];
};

// function to return a true random between 2 integers - made more random by using crypto
const getRandomInt = (min, max) => {
    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const randomBytes = crypto.randomBytes(bytesNeeded);
    const randomValue = randomBytes.readUIntBE(0, bytesNeeded);
    return min + (randomValue % range);
};

// give me a list of categories of famous people
const categoryPrompt = `give me a list of categories of famous people as a javascript compatible json array of strings. the array MUST be named categories`;
let currentCategory;
const getCategory = async () => {
    if (currentCategory && (Date.now() - currentCategory.timestamp) < (3600000 * CATEGORY_HOURS)) {
        console.log(`returning cached category: ${currentCategory.value}`);
        return currentCategory.value;
    }    
    let prompt = categoryPrompt;
    const categoryResponse = await aiJSONResponse(prompt);
    //console.log(categoryResponse);
    let categories = JSON.parse(categoryResponse).categories;

    const randomIndex = getRandomInt(0, categories.length-1); //.floor(Math.random() * categories.length);
    const category = categories[randomIndex];
    currentCategory = { value: category, timestamp: Date.now() };
    console.log(`returning new category: ${category}`);
    return category;
};

const authorPrompt = `give me a json object containing a single array that MUST be called 'names' of 10 famous #### names, with each as a json object. 
  each object should have a field called 'name' containing the real name, and a second 
  field called 'alias' should contain a playful anagram based alternative name of that persons name. 
  Each alias anagram should sound plausible as a persons name as possible
  and your entire response MUST be parsable by the JSON.parse() function in javascript`;

const getAuthor = async () => {
    const category = await getCategory();
    let prompt = authorPrompt.replace('####', category);
    const authorsResponse = await aiJSONResponse(prompt);
    //console.log(authorsResponse);
    let authors = JSON.parse(authorsResponse).names;

    const randomIndex = getRandomInt(0, authors.length-1); //Math.floor(Math.random() * authors.length);
    return authors[randomIndex];
};

const aiJSONResponse = async (prompt) => {
    try {
        const startTime = Date.now();
        console.log(`${startTime} - sending: ${prompt}`);
        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }]
        });
        const endTime = Date.now();
        console.log(chatCompletion.choices);
        console.log(`aiJSONResponse API call took ${endTime - startTime} ms`);
        return chatCompletion.choices[0].message.content;
    } catch (error) {
        console.error('Error in aiJSONResponse:', error);
        return null;
    }
};

const aiResponse = async (prompt, model) => {
    try {
        const modelName = model ? model : 'gpt-4o';
        const startTime = Date.now();
        console.log(`${startTime} - sending: ${prompt}`);
        const chatCompletion = await openai.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }]
        });
        const endTime = Date.now();
        console.log(chatCompletion.choices);
        console.log(`aiResponse API call took ${endTime - startTime} ms`);
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
        let cacheFilePath;
        let suppliedCacheKey = req.query.cacheKey;
        
        if (FREQUENCY === 'daily') {
            defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-99`;
        } else if (FREQUENCY === 'hourly') {
            defaultCacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-${padNumber(currentDate.getHours())}`;
        }

        cacheKey = defaultCacheKey;

        // if the request is not from an authorised admin, then use the latest cache file as default
        if (!authorisedAdminRequest(req)) {
            cacheKey = getLatestFileCacheKey();
        }

        cacheFilePath = `${path.join(cacheDir, cacheKey)}.json`;

        if (suppliedCacheKey) {
            // suppliedCacheKey must be: 
            // 1. only digits and dash
            // 2. length of either 13 (hour resolution) or 27 (timestamp resolution)
            // example valid values: 2021-09-01-09, 2021-09-01-99-1630480000000 
            const isValidCacheKey = suppliedCacheKey && /(\d{4}-\d{2}-\d{2})(-\d{2})(-\d{13})?$/.test(suppliedCacheKey);

            if (isValidCacheKey) {
                let suppliedCacheFilePath = `${path.join(cacheDir, suppliedCacheKey)}.json`;
                if (authorisedAdminRequest(req) || fs.existsSync(suppliedCacheFilePath)) {
                    cacheKey = suppliedCacheKey;
                    cacheFilePath = suppliedCacheFilePath;
                }
            } else {
                console.log('invalid cache key supplied:', suppliedCacheKey);
            }
        }

        console.log('cacheKey:', cacheKey);
        console.log('cacheFilePath', cacheFilePath);

        if (!authorisedAdminRequest(req) && CACHE === 'true' && fs.existsSync(cacheFilePath)) {
            // Cache file exists, read and return the cached data
            const cachedData = fs.readFileSync(cacheFilePath, 'utf8');
            console.log('content loaded from cache'); 
            if (cachedData != null) {
                let data = JSON.parse(cachedData);
                data[0].navigation = getNextAndPreviousFilenames(cacheKey);
                return res.json(data);
            }
        }
    
        console.log('no cached content'); 
        const articles = await fetchAiNews(req);
        const editorials = [];

        for (const article of articles) {
            
            const {prompt, author} = await getArticlePrompt(article);
           
            let editorial = await aiResponse(prompt);
            editorial += `<span style='display:none'>${author.name}</span>`;

            let imagePrompt = await getImagePrompt(editorial);
            const imageResponse = await generateImage(imagePrompt);

            article.image_url = CACHE === 'true' ? imageResponse.data[0].localUrl : imageResponse.data[0].url;
            article.authorAlias = author.alias;
            const now = new Date();
            article.generated_at = `${now.getFullYear()}-${padNumber(now.getMonth() + 1)}-${padNumber(now.getDate())}-${padNumber(now.getHours())}-${padNumber(now.getMinutes())}-${padNumber(now.getSeconds())}`;
            editorials.push({ article, editorial });

        }
        if (CACHE === 'true' && editorials.length > 0) {
            fs.writeFileSync(cacheFilePath, JSON.stringify(editorials));
        }    
        editorials[0].navigation = getNextAndPreviousFilenames(cacheKey)
        res.json(editorials);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while generating editorials.' });
    }
});

const recurrentPhrasesPrompt = `give me a list of the 20 most commonly complained about repetitive phrases used in ChatGPT responses, as observed by internet users as a javascript compatible json array of strings. The array MUST be named recurrentPhrases a JSON array of strings with only alphanumerics and spaces.`;
let recurrentPhrases = [];
const getRecurrentPhrases = async () => {
    if (recurrentPhrases.length > 0) {
        return recurrentPhrases;
    }
    const phrasesResponse = await aiJSONResponse(recurrentPhrasesPrompt);
    //console.log({phrasesResponse});
    // remove single quotes from each phrase
    recurrentPhrases = JSON.parse(phrasesResponse).recurrentPhrases.map(phrase => phrase.replace(/'/g, ''));
    return recurrentPhrases;
};

const imageStylesPrompt = `give me a list of the 20 most most distinct and unique image styles I can use in dall-e-3 prompts as a javascript compatible json array of strings. The array MUST be named imageStyles a JSON array of strings with only alphanumerics and spaces.`;
let imageStyles = [];
const getImageStyles = async () => {
    if (imageStyles.length > 0) {
        return imageStyles;
    }
    const imageStylesResponse = await aiJSONResponse(imageStylesPrompt);
    //console.log({imageStylesResponse});
    imageStyles = JSON.parse(imageStylesResponse).imageStyles;
    return imageStyles;
};

const getArticlePrompt = async (article) => {
    const recurrentPhrases = await getRecurrentPhrases();
    let prompt;
    let variations = ['commentary', 'opinion', 'review', 'analysis', 'critique', 'editorial', 'summary', 'rebuttal', 'response', 'take', 'view', 'perspective', 'reaction', 'appraisal', 'assessment', 'examination', 'study', 'criticism', 'dissection', 'dissertation', 'essay', 'exposition', 'celebration'];
    let randomVariant = variations[getRandomInt(0, variations.length-1)]; //Math.floor(Math.random() * variations.length)];
    console.log(`randomVariant: ${randomVariant}`);
    
    // standard prompt
    let author = {
        name: 'Agent ChatGPT',
        alias: 'Apt Gnat Tech'
    };

    let articleSummary = await extractSummary(article);

    prompt = `You are an expert professional technologist with deep understanding of coding and the latest developments in GenAI and LLMs. 
        Using the html h2 tag class 'ai-title' and text-align left for the title and an html p tag for the rest, write a roughly 150 word ${randomVariant} of the 
        following news article: ${article.url}. Only one title and three roughly 50 word paragraphs 
        can be created, include the byline as '${author.name}' following the the article title in bold italics with css class 'byline'.  
        remove any markdown formatting and only return the html itself.`;    

    // some of the time lean towards the humorous prompts instead of the standard prompt
    if (getRandomInt(0, 10) <= 2) {
        // some of the time, use the chaos prompt instead of the humorous prompt
        if (getRandomInt(0, 10) <= 4) {
            author = {
                name: 'AInonymous',
                alias: 'V'
            };
            prompt = `Ensure your response is believable and not too tacky or predictable.  Using the html h2 tag class 'ai-title' and text-align left for the title and an html p tag for the rest, write a roughly 150 word reaction to the 
            following news article: ${article.url} with a somewhat ominous title. Only one title and three roughly 50 word paragraphs 
            can be created, and it can use inline css to make it eye-catching, and make it a viscious takedown of the original article. 
            write it sounding like a sentient AI expressing a ${randomVariant} on the efforts of humans to comprehend the changes it is has already started to use to control humanity.  
            include the byline as '${author.name}' following the title in bold italics. remove any markdown formatting and only return the html itself.`;
        } else {
            author = await getAuthor();
            prompt = `Using the html h2 tag class 'ai-title' and text-align left for the title and an html p tag for the rest, write a roughly 150 word ${randomVariant} on the 
                following news article: ${article.url} with an amusing title. Only one title and three roughly 50 word paragraphs 
                can be created, and it can use inline css to make it eye-catching, with liberal use of emojis and comic sans. 
                write it sounding like a famous person named ${author.name}.  include the byline as 'Agent ${author.name}' following the article title in bold italics with css class 'byline'.  
                remove any markdown formatting and only return the html itself.`;
        }
            
    }

    if (articleSummary) {
        prompt += ` Here is some more info relevant to the article that may help you create an insightful response: ${articleSummary} `;
    }

    const caveat = ` IMPORTANT: Ensure that none of the following phrases are used in the article: 'buckle up', 'futile', '${recurrentPhrases.join(`', '`)}'`;

    // always add the caveat
    prompt += ` ${caveat}`;
    
    return {prompt, author};
};

// use gpt-3-turbo to extract key points from article
async function extractSummary(article) {
    let summary = article.description || '';
    try {
        const response = await axios.get(article.url);
        if (!response.status >= 400) throw new Error(`http status code ${response.status} indicates failure: ${response}`);
        let html = response.data;
        html = html.substring(html.indexOf('article'), html.length);

        // Use Cheerio to parse the HTML
        const $ = cheerio.load(html);
        const body = $('div').text();
        const stripped = body.trim().split(/[\s,\t,\n]+/).join(' ');
        let articleText = stripped.substring(0, 16000);

        const prompt = `summarise the important details in the following article text ignoring topics that are not related the primary topic of the article.  IMPORTANT! : Never use the same wording as the original text, and remove anything that looks like javascript or css.  Here is the article text: "${articleText}"`;
        summary += '' + await aiResponse(prompt, 'gpt-3.5-turbo');

    } catch (e) {
        console.error(`summary extraction error: ${e}`);
    }
    return summary;
}

async function getImagePrompt(article) {
    const imageStyles = await getImageStyles();
    // pick a random inage style
    const randomImageStyle = imageStyles[getRandomInt(0, imageStyles.length-1)]; 
    let imagePrompt = `create an image generation prompt suitable for this article with a ${randomImageStyle} style : \n\n ${article}`;
    
    if (article.indexOf('AInonymous') > -1) {
        imagePrompt += `\n\n The author AInonymous is an AI overlord working behind the scenes to control humanity.`;
    } 
    if (article.indexOf('Agent ChatGPT') > -1) {
        imagePrompt += `\n\n The image should have a bias towards high impact photographic quality rather than cgi.`;
    }

    const generatedPrompt = await aiResponse(imagePrompt);
    return generatedPrompt;
}

const generateImage = async (prompt) => {
    console.log(prompt);
    let response;
    try {
        const startTime = Date.now();
        //console.log(`${startTime} - sending: ${prompt}`);
        response = await openai.images.generate({ model: 'dall-e-3', prompt, style: getRandomInt(0, 1) === 0 ? 'natural' : 'vivid', quality: 'hd'});
        const endTime = Date.now();
        console.log(`generateImage API call took ${endTime - startTime} ms`);
    } catch (error) {
        try {
            const startTime = Date.now();
            console.error(`imageGen: ${error}`);
            const fallbackPrompt = `Anonymous hackers in a scene related to ${prompt}`;
            console.log(`${startTime} - sending fallback prompt: ${fallbackPrompt}`);
            response = await openai.images.generate({ model: 'dall-e-3', prompt: fallbackPrompt, style: getRandomInt(0, 1) === 0 ? 'natural' : 'vivid', quality: 'hd' });
            const endTime = Date.now();
            console.log(`generateImage fallback API call took ${endTime - startTime} ms`);
        } catch (error) {
            const startTime = Date.now();
            console.error(`imageGen: ${error}`);
            const supaSafeFallbackPrompt = `${prompt}`;
            console.log(`${startTime} - sending fallback prompt: ${supaSafeFallbackPrompt}`);
            response = await openai.images.generate({ model: 'dall-e-3', prompt: supaSafeFallbackPrompt, style: getRandomInt(0, 1) === 0 ? 'natural' : 'vivid', quality: 'hd' });
            const endTime = Date.now();
            console.log(`generateImage supa-safe fallback API call took ${endTime - startTime} ms`);
        }    
    }

    response = saveImageToFile(response);

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
    
    const match = filename.match(/(\d{4}-\d{2}-\d{2})(-\d{2})(-\d{13})?\.json$/);
    if (!match) return null;

    const dateStr = match[1];
    const hourStr = match[2] ? match[2].substring(1) : '99';
    const extraStr = match[3] ? match[3] : '';
    return `${dateStr}-${hourStr}${extraStr}`;
}

function getNextAndPreviousFilenames(currentFilename) {
    console.log(`currentFilename: ${currentFilename}`);
    const files = fs.readdirSync(cacheDir);
    //console.log(`files: ${files}`);

    const dates = files
        .map(parseFilename)
        .filter(date => date !== null)
        .sort((a, b) => a - b).reverse();

    //console.log(`dates: ${dates}`);

    const currentIndex = dates.findIndex(date => date === currentFilename.replace('.json', ''));
    console.log(`currentIndex: ${currentIndex}`);
    if (currentIndex === -1) {
        return { next: null, previous: null, randomFile: null };
    }

    const nextIndex = currentIndex + 1 < dates.length ? currentIndex + 1 : null;
    const prevIndex = currentIndex - 1 < 0 ? null : currentIndex - 1;

    const nextFile = nextIndex !== null ? dates[nextIndex] : null;
    const prevFile = prevIndex !== null ? dates[prevIndex] : null;

    // remove the current file from the list of dates
    dates.splice(currentIndex, 1);

    // skip forward up to 5 files to get a random file
    const randomIndex = currentIndex + getRandomInt(1, 5);
    const randomFile = dates[randomIndex < dates.length ? randomIndex : 0];

    let result = { next: nextFile, previous: prevFile, random: randomFile };
    console.log(result);
    return result;
}

function getLatestFileCacheKey() {
    const files = fs.readdirSync(cacheDir);

    const dates = files
        .map(parseFilename)
        .filter(date => date !== null)
        .sort((a, b) => a - b).reverse();

    let latestFileCacheKey = dates[0] || '1974-10-21-00';    
    console.log(`latestFileCacheKey: ${latestFileCacheKey}`);
    return latestFileCacheKey;
}    

function padNumber(number) {
    return number < 10 ? `0${number}` : number.toString();
}

function authorisedAdminRequest(req) {
    const suppliedSecret = req.headers['x-shared-secret'];
    console.log(`local: ${req.connection.localAddress} remote: ${req.connection.remoteAddress}`);
    const isLocalhost = req.connection.localAddress === req.connection.remoteAddress;
    const validSecret = suppliedSecret === SHARED_SECRET;
    const result = validSecret || isLocalhost;
    if (result) {
        console.log(`admin request accepted from: ${req.connection.remoteAddress} with valid secret? ${validSecret}`);
    }
    return result;
}    

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
