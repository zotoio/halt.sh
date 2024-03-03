import fs from 'fs';
import esprima from 'esprima';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the code from the local relative file
const filePath = `${__dirname}/index.js`; 
console.log(`reading ${filePath}`);
const code = fs.readFileSync(filePath, 'utf-8');

// Parse the code into an AST
const ast = esprima.parseModule(code, { loc: true });

// Save the AST to a JSON file
const astFilePath = `${__dirname}/ast.json`;
fs.writeFileSync(astFilePath, JSON.stringify(ast, null, 2));

console.log(`AST has been saved to ${astFilePath}`);
