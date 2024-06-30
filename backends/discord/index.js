import { config } from 'dotenv';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import axios from 'axios';

config();

const {
  SHARED_SECRET,
  DISCORD_TOKEN,
  DISCORD_APPLICATION_ID,
  EDITORIAL_FRONTEND_URL_PREFIX
} = process.env;

const commands = [
  {
    name: 'editorial',
    description: 'generate an editorial for a given article url',
    type: 1,
    options: [
      {
        name: 'article',
        description: 'the url of the article',
        type: 3,
        required: true
      }
    ]
  },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log('Started refreshing application (/) commands.');

  await rest.put(Routes.applicationCommands(DISCORD_APPLICATION_ID), { body: commands });

  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}

const client = new Client({ intents: [ GatewayIntentBits.Guilds ] });

function padNumber(number) {
  return number < 10 ? `0${number}` : number.toString();
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'editorial') {

    if (interaction.options.get('article').value.startsWith('http')) {
      const articleUrl = interaction.options.get('article').value;

      const currentDate = new Date();

      await interaction.reply(`Ok, I'm reviewing the article: ${articleUrl} and will let you know when I'm done!`);
      console.log('sending article for review', articleUrl);

      const cacheKey = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}-${padNumber(currentDate.getHours())}-${Date.now()}` 
      console.log('cacheKey', cacheKey);

      const requestConfig = {
        params: {
          articleUrl,
          cacheKey
        },
        headers: {
          'x-shared-secret': SHARED_SECRET,
          'Content-Type': 'application/json'
        }
      };

      const response = await axios.get(
        'http://botz:3000/editorials', requestConfig
      );

      const outcome = `editorial generated! ${EDITORIAL_FRONTEND_URL_PREFIX}/#${cacheKey}`;
      await interaction.followUp(outcome);
      console.log(outcome);
    }
  }
});

client.login(DISCORD_TOKEN);
