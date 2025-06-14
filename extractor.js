import fs from 'fs';
import path from 'path';

/**
 * Extract 2 decryption arrays from deobfuscated JavaScript file
 * @param {string} jsContent - JavaScript file content
 * @returns {Object|null} - Object containing information of 2 arrays and decryption key
 */
function extractDecryptionArrays(jsContent) {
    try {
        console.log('🔍 Starting file analysis...');
        
        // Find main function containing decryption logic (after anti-debugging checks)
        const mainFunctionPatterns = [
            /if\s*\(f\[[\d]+\]\.D0DDDsX\(\)\)\s*{\s*\(\(\)\s*=>\s*{([\s\S]*?)}\)\(\)/,
            /if\s*\([\w\[\]]+\.[\w]+\(\)\)\s*{\s*\(\(\)\s*=>\s*{([\s\S]*?)}\)\(\)/,
            /\(\(\)\s*=>\s*{[\s\S]*?var\s+[\w,\s]+;([\s\S]*?)}\)\(\)/
        ];
        
        let mainContent = null;
        for (const pattern of mainFunctionPatterns) {
            const match = jsContent.match(pattern);
            if (match) {
                mainContent = match[1];
                console.log('✅ Found main function');
                break;
            }
        }
        
        if (!mainContent) {
            console.log('❌ Could not find main function');
            return null;
        }
        
        // Pattern to find 2 consecutive arrays
        console.log('🔍 Searching for 2 arrays...');
        
        // Find string array (containing hex fragments)
        const stringArrayPatterns = [
            /(\w+)\s*=\s*\[\s*((?:"[^"]*"(?:\s*,\s*)?)+)\s*\]/g,
            /(\w+)\s*=\s*\[\s*((?:'[^']*'(?:\s*,\s*)?)+)\s*\]/g
        ];
        
        // Find number array (containing mapping indices)  
        const numberArrayPatterns = [
            /(\w+)\s*=\s*\[\s*((?:\d+(?:\s*,\s*)?)+)\s*\]/g
        ];
        
        let stringArrays = [];
        let numberArrays = [];
        
        // Extract string arrays
        for (const pattern of stringArrayPatterns) {
            let match;
            while ((match = pattern.exec(mainContent)) !== null) {
                const arrayName = match[1];
                const arrayContent = match[2]
                    .split(',')
                    .map(s => s.trim().replace(/['"]/g, ''))
                    .filter(s => s.length > 0);
                
                if (arrayContent.length > 10) { // Filter for substantial arrays
                    stringArrays.push({
                        name: arrayName,
                        content: arrayContent,
                        position: match.index
                    });
                }
            }
        }
        
        // Extract number arrays  
        for (const pattern of numberArrayPatterns) {
            let match;
            while ((match = pattern.exec(mainContent)) !== null) {
                const arrayName = match[1];
                const arrayContent = match[2]
                    .split(',')
                    .map(n => parseInt(n.trim()))
                    .filter(n => !isNaN(n));
                
                if (arrayContent.length > 10) { // Filter for substantial arrays
                    numberArrays.push({
                        name: arrayName,
                        content: arrayContent,
                        position: match.index
                    });
                }
            }
        }
        
        console.log(`📊 Found ${stringArrays.length} string arrays and ${numberArrays.length} number arrays`);
        
        if (stringArrays.length === 0 || numberArrays.length === 0) {
            console.log('❌ Could not find enough arrays');
            return null;
        }
        
        // Find pair of arrays used together in function
        console.log('🔍 Searching for function mapping...');
        
        for (const stringArray of stringArrays) {
            for (const numberArray of numberArrays) {
                // Find function using these 2 arrays
                const functionPatterns = [
                    new RegExp(`(\\w+)\\s*=\\s*\\(\\)\\s*=>\\s*{[\\s\\S]*?return\\s+${numberArray.name}\\[[\\"\\']map[\\"\\']\\]\\([\\s\\S]*?return\\s+${stringArray.name}\\[[\\s\\S]*?\\}\\)[\\s\\S]*?[\\"\\']join[\\"\\']\\]\\([\\s\\S]*?\\)`),
                    new RegExp(`return\\s+${numberArray.name}\\.map\\([\\s\\S]*?${stringArray.name}\\[[\\s\\S]*?\\)\\.join\\(`),
                    new RegExp(`${numberArray.name}\\[[\\"\\']map[\\"\\']\\]\\([\\s\\S]*?${stringArray.name}\\[`)
                ];
                
                for (const pattern of functionPatterns) {
                    if (pattern.test(mainContent)) {
                        console.log('✅ Found mapping function!');
                        
                        // Validate mapping (check if indices are valid)
                        const maxIndex = Math.max(...numberArray.content);
                        if (maxIndex >= stringArray.content.length) {
                            console.log(`⚠️  Index out of bounds: max=${maxIndex}, array length=${stringArray.content.length}`);
                            continue;
                        }
                        
                        // Generate decryption key
                        const decryptionKey = numberArray.content
                            .map(index => stringArray.content[index])
                            .join('');
                        
                        console.log('🎉 Extraction successful!');
                        
                        return {
                            stringArray: {
                                name: stringArray.name,
                                content: stringArray.content,
                                length: stringArray.content.length
                            },
                            numberArray: {
                                name: numberArray.name,
                                content: numberArray.content,
                                length: numberArray.content.length
                            },
                            decryptionKey: decryptionKey,
                            keyLength: decryptionKey.length,
                            analysis: {
                                stringArraySample: stringArray.content.slice(0, 5),
                                numberArraySample: numberArray.content.slice(0, 10),
                                keySample: decryptionKey.substring(0, 32) + '...'
                            }
                        };
                    }
                }
            }
        }
        
        // Fallback: if no function found, try first pair
        console.log('⚠️  Could not find mapping function, using first pair...');
        
        const stringArray = stringArrays[0];
        const numberArray = numberArrays[0];
        
        if (stringArray && numberArray) {
            const maxIndex = Math.max(...numberArray.content);
            if (maxIndex < stringArray.content.length) {
                const decryptionKey = numberArray.content
                    .map(index => stringArray.content[index])
                    .join('');
                
                return {
                    stringArray: {
                        name: stringArray.name,
                        content: stringArray.content,
                        length: stringArray.content.length
                    },
                    numberArray: {
                        name: numberArray.name,
                        content: numberArray.content,
                        length: numberArray.content.length
                    },
                    decryptionKey: decryptionKey,
                    keyLength: decryptionKey.length,
                    warning: 'Using first array pair (could not find function mapping)'
                };
            }
        }
        
        console.log('❌ Could not extract valid arrays');
        return null;
        
    } catch (error) {
        console.error('❌ Error during extraction:', error.message);
        return null;
    }
}

/**
 * Save results to JSON file
 */
function saveResults(result, outputPath = 'extracted_arrays.json') {
    try {
        const output = {
            timestamp: new Date().toISOString(),
            ...result
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
        console.log(`💾 Results saved to file: ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`❌ Error saving file: ${error.message}`);
        return false;
    }
}

/**
 * Generate test decryption code
 */
function generateTestCode(result) {
    return `
// Generated Decryption Test Code
const CryptoJS = require('crypto-js');

// Extracted Arrays
const stringArray = ${JSON.stringify(result.stringArray.content, null, 2)};
const numberArray = ${JSON.stringify(result.numberArray.content, null, 2)};

// Generated Decryption Key
const decryptionKey = "${result.decryptionKey}";

// Test decryption function
function testDecryption(encryptedData) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, decryptionKey);
        const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
        return decryptedText;
    } catch (error) {
        console.error('Decryption failed:', error.message);
        return null;
    }
}

// Export for use
module.exports = {
    stringArray,
    numberArray, 
    decryptionKey,
    testDecryption
};

console.log('Decryption Key:', decryptionKey);
console.log('Key Length:', decryptionKey.length);
`;
}

// Main execution
function main() {
    console.log('🚀 Megacloud Decryption Array Extractor');
    console.log('=====================================');
    
    const inputFile = 'output.js';
    
    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ File ${inputFile} does not exist!`);
        console.log('💡 Please ensure the dec.js file is in the same directory as this script.');
        return;
    }
    
    // Read input file
    console.log(`📖 Reading file: ${inputFile}`);
    const jsContent = fs.readFileSync(inputFile, 'utf8');
    console.log(`📊 File size: ${(jsContent.length / 1024).toFixed(2)} KB`);
    
    // Extract arrays
    const result = extractDecryptionArrays(jsContent);
    
    console.log(result);

    if (result) {
        console.log('\n🎉 EXTRACTION RESULTS:');
        console.log('====================');
        console.log(`📝 String Array (${result.stringArray.name}): ${result.stringArray.length} elements`);
        console.log(`🔢 Number Array (${result.numberArray.name}): ${result.numberArray.length} elements`);
        console.log(`🔑 Decryption Key: ${result.keyLength} characters`);
        console.log(`🔍 Key Preview: ${result.analysis.keySample}`);
        
        if (result.warning) {
            console.log(`⚠️  Warning: ${result.warning}`);
        }
        
        // Save results
        saveResults(result);
        
        // Generate test code
        const testCode = generateTestCode(result);
        fs.writeFileSync('decryption_test.js', testCode, 'utf8');
        console.log('🧪 Created test file: decryption_test.js');
        
        console.log('\n✅ Complete! You can use the decryption key to decrypt video sources.');
        
    } else {
        console.log('\n❌ COULD NOT EXTRACT');
        console.log('======================');
        console.log('💡 Possible reasons:');
        console.log('   - File was obfuscated in a different way');
        console.log('   - Code structure has changed');
        console.log('   - Need to update patterns in script');
    }
}

main();