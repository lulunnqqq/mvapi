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
        
        // Try to find arrays in the entire file first
        console.log('🔍 Searching for arrays in entire file...');
        
        // Enhanced patterns to find string arrays (hex fragments)
        const stringArrayPatterns = [
            // Standard assignment with double quotes
            /(\w+)\s*=\s*\[\s*((?:"[^"]*"(?:\s*,\s*)?)+)\s*\]/g,
            // Standard assignment with single quotes  
            /(\w+)\s*=\s*\[\s*((?:'[^']*'(?:\s*,\s*)?)+)\s*\]/g,
            // With whitespace and line breaks
            /(\w+)\s*=\s*\[\s*((?:"[^"]*"(?:\s*,\s*\n?\s*)?)+)\s*\]/g,
            /(\w+)\s*=\s*\[\s*((?:'[^']*'(?:\s*,\s*\n?\s*)?)+)\s*\]/g,
        ];
        
        // Enhanced patterns to find number arrays (mapping indices)
        const numberArrayPatterns = [
            // Standard number array
            /(\w+)\s*=\s*\[\s*((?:\d+(?:\s*,\s*)?)+)\s*\]/g,
            // With whitespace and line breaks
            /(\w+)\s*=\s*\[\s*((?:\d+(?:\s*,\s*\n?\s*)?)+)\s*\]/g,
        ];
        
        let stringArrays = [];
        let numberArrays = [];
        
        // Extract string arrays from entire file
        for (const pattern of stringArrayPatterns) {
            pattern.lastIndex = 0; // Reset regex
            let match;
            while ((match = pattern.exec(jsContent)) !== null) {
                const arrayName = match[1];
                const arrayContent = match[2]
                    .split(',')
                    .map(s => s.trim().replace(/['"]/g, ''))
                    .filter(s => s.length > 0);
                
                // Check if it looks like hex fragments (contains hex-like strings)
                const hasHexLike = arrayContent.some(s => 
                    /^[0-9a-f]+$/i.test(s) || 
                    /^[0-9a-f]{1,4}$/i.test(s)
                );
                
                if (arrayContent.length > 10 && hasHexLike) {
                    stringArrays.push({
                        name: arrayName,
                        content: arrayContent,
                        position: match.index,
                        fullMatch: match[0]
                    });
                    console.log(`📝 Found string array: ${arrayName} with ${arrayContent.length} elements`);
                }
            }
        }
        
        // Extract number arrays from entire file
        for (const pattern of numberArrayPatterns) {
            pattern.lastIndex = 0; // Reset regex
            let match;
            while ((match = pattern.exec(jsContent)) !== null) {
                const arrayName = match[1];
                const arrayContent = match[2]
                    .split(',')
                    .map(n => parseInt(n.trim()))
                    .filter(n => !isNaN(n));
                
                if (arrayContent.length > 10) {
                    numberArrays.push({
                        name: arrayName,
                        content: arrayContent,
                        position: match.index,
                        fullMatch: match[0]
                    });
                    console.log(`🔢 Found number array: ${arrayName} with ${arrayContent.length} elements`);
                }
            }
        }
        
        console.log(`📊 Found ${stringArrays.length} string arrays and ${numberArrays.length} number arrays`);
        
        if (stringArrays.length === 0 || numberArrays.length === 0) {
            console.log('❌ Could not find enough arrays');
            
            // Fallback: try to find arrays in main function
            console.log('🔍 Trying fallback search in main function...');
            return extractFromMainFunction(jsContent);
        }
        
        // Find the best pair of arrays
        console.log('🔍 Finding best array pair...');
        
        // Sort by position to find arrays that are close to each other
        const allArrays = [
            ...stringArrays.map(arr => ({...arr, type: 'string'})),
            ...numberArrays.map(arr => ({...arr, type: 'number'}))
        ].sort((a, b) => a.position - b.position);
        
        // Find pairs of arrays that are close to each other
        for (let i = 0; i < allArrays.length - 1; i++) {
            const first = allArrays[i];
            const second = allArrays[i + 1];
            
            // Check if they are close to each other (within 1000 characters)
            if (Math.abs(first.position - second.position) < 1000 && 
                first.type !== second.type) {
                
                const stringArray = first.type === 'string' ? first : second;
                const numberArray = first.type === 'number' ? first : second;
                
                // Validate mapping
                const maxIndex = Math.max(...numberArray.content);
                if (maxIndex >= stringArray.content.length) {
                    console.log(`⚠️  Index out of bounds: max=${maxIndex}, array length=${stringArray.content.length}`);
                    continue;
                }
                
                // Look for function using these arrays
                const functionPatterns = [
                    // Pattern: array2.map(x => array1[x]).join("")
                    new RegExp(`${numberArray.name}\\s*\\[\\s*["\']map["\']\\s*\\]\\s*\\([^)]*?${stringArray.name}\\s*\\[`, 'i'),
                    new RegExp(`${numberArray.name}\\.map\\s*\\([^)]*?${stringArray.name}\\s*\\[`, 'i'),
                    // Pattern: return array2.map(...).join("")
                    new RegExp(`return\\s+${numberArray.name}\\s*\\[\\s*["\']map["\']\\s*\\]\\([^)]*?${stringArray.name}`, 'i'),
                    new RegExp(`return\\s+${numberArray.name}\\.map\\([^)]*?${stringArray.name}`, 'i'),
                ];
                
                let foundFunction = false;
                for (const pattern of functionPatterns) {
                    if (pattern.test(jsContent)) {
                        console.log('✅ Found mapping function!');
                        foundFunction = true;
                        break;
                    }
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
                        keySample: decryptionKey.substring(0, 32) + '...',
                        foundFunction: foundFunction,
                        distance: Math.abs(first.position - second.position)
                    }
                };
            }
        }
        
        // If no close pairs found, try the first valid pair
        console.log('⚠️  No close pairs found, trying first valid pair...');
        
        for (const stringArray of stringArrays) {
            for (const numberArray of numberArrays) {
                // Validate mapping
                const maxIndex = Math.max(...numberArray.content);
                if (maxIndex >= stringArray.content.length) {
                    continue;
                }
                
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
                    warning: 'Using first valid array pair (arrays not close to each other)'
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
 * Fallback function to extract arrays from main function (original logic)
 */
function extractFromMainFunction(jsContent) {
    try {
        console.log('🔍 Searching for main function...');
        
        // Find main function containing decryption logic (after anti-debugging checks)
        const mainFunctionPatterns = [
            /if\s*\(f\[[\d]+\]\.D0DDDsX\(\)\)\s*{\s*\(\(\)\s*=>\s*{([\s\S]*?)}\)\(\)/,
            /if\s*\([\w\[\]]+\.[\w]+\(\)\)\s*{\s*\(\(\)\s*=>\s*{([\s\S]*?)}\)\(\)/,
            /\(\(\)\s*=>\s*{[\s\S]*?var\s+[\w,\s]+;([\s\S]*?)}\)\(\)/,
            // New patterns for the current structure
            /if\s*\([^)]+\)\s*{\s*\(\(\)\s*=>\s*{([\s\S]*?)}\)\(\)/,
            /\(\(\)\s*=>\s*{[\s\S]*?var\s+[^;]+;([\s\S]*?)}\)\(\)/
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
        
        // Continue with original logic but in main function
        console.log('🔍 Searching for arrays in main function...');
        
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
        
        console.log(`📊 Found ${stringArrays.length} string arrays and ${numberArrays.length} number arrays in main function`);
        
        if (stringArrays.length === 0 || numberArrays.length === 0) {
            console.log('❌ Could not find enough arrays in main function');
            return null;
        }
        
        // Find pair of arrays used together in function
        console.log('🔍 Searching for function mapping in main function...');
        
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
                        console.log('✅ Found mapping function in main function!');
                        
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
                        
                        console.log('🎉 Extraction successful from main function!');
                        
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
        console.log('⚠️  Could not find mapping function in main function, using first pair...');
        
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
                    warning: 'Using first array pair from main function (could not find function mapping)'
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Error during fallback extraction:', error.message);
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

/**
 * Extract decrypt key string from JS file following API flow: getSources -> __z1d -> E() -> A()+Y()+...
 */
function extractDecryptKey(jsContent) {
    try {
        console.log('\n=== EXTRACTING DECRYPT KEY ===');
        console.log('🔧 Using multiple fallback methods (no dependency on specific function names)');
        console.log('📌 Priority: Direct pattern → API trace → Crypto pattern → Generic → 9-function pattern');
        
        // Method 1: Find direct concatenation function E() pattern (BEST - no name dependency)
        console.log('Method 1: Searching for concatenation function...');
        const concatenationPattern = /(\w+)\s*=\s*\(\)\s*=>\s*{[^}]*?return\s+(\w+\(\)\s*\+[^;]+);/gs;
        let match;
        
        while ((match = concatenationPattern.exec(jsContent)) !== null) {
            const functionName = match[1];
            const returnStatement = match[2];
            
            console.log('Found concatenation function:', functionName);
            console.log('Return statement:', returnStatement);
            
            // Check if it's the pattern A() + B() + C() + ...
            if (/\w+\(\)\s*\+\s*\w+\(\)/.test(returnStatement)) {
                const result = extractKeyFromConcatenation(jsContent, returnStatement);
                if (result) return result;
            }
        }
        
        // Method 2: Find via API getSources pattern
        console.log('Method 2: Searching via getSources API pattern...');
        const apiPattern = /getSources[^}]*?["']parse["'][^}]*?(\w+)\[["'](\w+)["']\][^}]*?\(([^)]+)\)/s;
        const apiMatch = jsContent.match(apiPattern);
        
        if (apiMatch) {
            console.log('Found API call pattern with decrypt function:', apiMatch[2]);
            const result = findDecryptKeyFromAPI(jsContent, apiMatch[2]);
            if (result) return result;
        }
        
        // Method 3: Find via CryptoJS AES decrypt pattern
        console.log('Method 3: Searching via CryptoJS pattern...');
        const cryptoPattern = /(\w+)\s*=\s*(\w+)\[["']AES["']\]\[["']decrypt["']\]/;
        const cryptoMatch = jsContent.match(cryptoPattern);
        
        if (cryptoMatch) {
            console.log('Found CryptoJS decrypt pattern');
            const result = findDecryptKeyFromCrypto(jsContent);
            if (result) return result;
        }
        
        // Method 4: Find any generic decrypt function
        console.log('Method 4: Searching for generic decrypt function...');
        const genericDecryptPattern = /(\w+)\[["'](\w+)["']\]\s*=\s*[^{]*?=>\s*{[^}]*?(\w+)\s*=\s*(\w+)\(\)/gs;
        let genericMatch;
        
        while ((genericMatch = genericDecryptPattern.exec(jsContent)) !== null) {
            const keyFunctionName = genericMatch[4];
            console.log('Found potential decrypt function with key function:', keyFunctionName);
            
            // Check if this function is a concatenation function
            if (isConcatenationFunction(jsContent, keyFunctionName)) {
                const result = extractKeyFromFunction(jsContent, keyFunctionName);
                if (result) return result;
            }
        }
        
        // Method 5: Find any function with 9 concatenated calls directly
        console.log('Method 5: Searching for any function with 9 concatenated calls...');
        const nineFunctionPattern = /(\w+)\s*=\s*\(\)\s*=>\s*{[^}]*?return\s+(\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\)\s*\+\s*\w+\(\))/gs;
        let nineMatch;
        
        while ((nineMatch = nineFunctionPattern.exec(jsContent)) !== null) {
            const returnStatement = nineMatch[2];
            console.log('Found function with 9 concatenated calls:', nineMatch[1]);
            const result = extractKeyFromConcatenation(jsContent, returnStatement);
            if (result) return result;
        }
        
        console.log('Could not find decrypt key using any method');
        return null;
        
    } catch (error) {
        console.error('Error extracting decrypt key:', error);
        return null;
    }
}

/**
 * Check if function is a concatenation function
 */
function isConcatenationFunction(jsContent, functionName) {
    const functionPattern = new RegExp(`${functionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^}]*?return\\s+([^;]+);`, 's');
    const match = jsContent.match(functionPattern);
    
    if (!match) return false;
    
    const returnStatement = match[1];
    // Check if it's the pattern A() + B() + C() + ...
    const concatenationPattern = /\w+\(\)\s*\+\s*\w+\(\)/;
    return concatenationPattern.test(returnStatement);
}

/**
 * Extract key from concatenation return statement 
 */
function extractKeyFromConcatenation(jsContent, returnStatement) {
    try {
        console.log('Extracting key from concatenation:', returnStatement);
        
        // Parse function calls from return statement
        const functionCalls = returnStatement.split('+').map(call => call.trim().replace(/\(\)$/, ''));
        console.log('Function calls:', functionCalls);
        
        // Extract string from each function
        let decryptKey = '';
        
        for (const funcName of functionCalls) {
            const stringValue = extractStringFromFunction(jsContent, funcName.trim());
            if (stringValue) {
                decryptKey += stringValue;
                console.log(`${funcName}() = "${stringValue}"`);
            } else {
                console.log(`Could not find string for function: ${funcName}`);
            }
        }
        
        console.log('Final decrypt key:', decryptKey);
        return decryptKey;
        
    } catch (error) {
        console.error('Error extracting key from concatenation:', error);
        return null;
    }
}

/**
 * Extract key from concatenation function
 */
function extractKeyFromFunction(jsContent, functionName) {
    try {
        console.log('Extracting key from function:', functionName);
        
        // Find function definition
        const functionPattern = new RegExp(`${functionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^}]*?return\\s+([^;]+);`, 's');
        const match = jsContent.match(functionPattern);
        
        if (!match) {
            console.log('Could not find function definition for:', functionName);
            return null;
        }
        
        const returnStatement = match[1].trim();
        console.log('Return statement:', returnStatement);
        
        // Parse function calls from return statement
        const functionCalls = returnStatement.split('+').map(call => call.trim().replace(/\(\)$/, ''));
        console.log('Function calls:', functionCalls);
        
        // Extract string from each function
        let decryptKey = '';
        
        for (const funcName of functionCalls) {
            const stringValue = extractStringFromFunction(jsContent, funcName.trim());
            if (stringValue) {
                decryptKey += stringValue;
                console.log(`${funcName}() = "${stringValue}"`);
            } else {
                console.log(`Could not find string for function: ${funcName}`);
            }
        }
        
        console.log('Final decrypt key:', decryptKey);
        return decryptKey;
        
    } catch (error) {
        console.error('Error extracting key from function:', error);
        return null;
    }
}

/**
 * Extract string value from a function
 */
function extractStringFromFunction(jsContent, functionName) {
    try {
        // Escape function name to avoid regex injection
        const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Find function definition with different patterns
        const patterns = [
            // Pattern 1: Simple - function() { return "string"; }
            new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^}]*?return\\s+["']([^"']+)["']`, 's'),
            
            // Pattern 2: With if condition - function() { if(...) { return "string"; } }
            new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^}]*?if\\s*\\([^)]+\\)\\s*{[^}]*?return\\s+["']([^"']+)["']`, 's'),
            
            // Pattern 3: Multi-line with if and else
            new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^{}]*?if\\s*\\([^)]+\\)\\s*{[^}]*?return\\s+["']([^"']+)["'][^}]*?}[^}]*?}`, 's'),
            
            // Pattern 4: With other code lines before return
            new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[\\s\\S]*?return\\s+["']([^"']+)["'][\\s\\S]*?}`, 's'),
            
            // Pattern 5: Find in first if block
            new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[\\s\\S]*?if\\s*\\([^)]+\\)\\s*{[\\s\\S]*?return\\s+["']([^"']+)["']`, 's')
        ];
        
        for (let i = 0; i < patterns.length; i++) {
            const match = jsContent.match(patterns[i]);
            if (match) {
                console.log(`Found string for ${functionName} using pattern ${i + 1}: "${match[1]}"`);
                return match[1];
            }
        }
        
        // Debug: Find function to see structure
        const functionDefPattern = new RegExp(`${escapedFunctionName}\\s*=\\s*\\(\\)\\s*=>\\s*{[^{}]*?}`, 's');
        const functionDef = jsContent.match(functionDefPattern);
        if (functionDef) {
            console.log(`Debug - Found function ${functionName}:`, functionDef[0]);
        } else {
            console.log(`Debug - Could not find function definition for: ${functionName}`);
        }
        
        return null;
    } catch (error) {
        console.error(`Error extracting string from function ${functionName}:`, error);
        return null;
    }
}

/**
 * Find decrypt key from API getSources pattern
 */
function findDecryptKeyFromAPI(jsContent, decryptFunctionName) {
    try {
        // Find function definition of decrypt function
        const patterns = [
            // Pattern for assignment like: r5Jvh["__z1d"] = functionName => { ... }
            new RegExp(`(\\w+)\\[["']${decryptFunctionName}["']\\]\\s*=\\s*[^{]*?=>\\s*{[\\s\\S]*?([\\w]+)\\s*=\\s*(\\w+)\\(\\)`, 's'),
            // Pattern for any object property assignment
            new RegExp(`\\[["']${decryptFunctionName}["']\\]\\s*=\\s*[^{]*?=>\\s*{[\\s\\S]*?([\\w]+)\\s*=\\s*(\\w+)\\(\\)`, 's'),
            // More general pattern
            new RegExp(`${decryptFunctionName}[\\s\\S]*?([\\w]+)\\s*=\\s*(\\w+)\\(\\)`, 's')
        ];
        
        for (const pattern of patterns) {
            const match = jsContent.match(pattern);
            if (match) {
                const keyFunctionName = match[match.length - 1]; // Get last capture group
                console.log('Found key function from API pattern:', keyFunctionName);
                
                if (isConcatenationFunction(jsContent, keyFunctionName)) {
                    return extractKeyFromFunction(jsContent, keyFunctionName);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding decrypt key from API:', error);
        return null;
    }
}

/**
 * Find decrypt key from CryptoJS pattern
 */
function findDecryptKeyFromCrypto(jsContent) {
    try {
        // Find pattern calling AES decrypt with key
        const aesPattern = /(\w+)\(([^,]+),\s*(\w+)\)/g;
        let match;
        
        while ((match = aesPattern.exec(jsContent)) !== null) {
            const keyVariable = match[3];
            console.log('Found potential key variable:', keyVariable);
            
            // Find assignment of key variable
            const keyAssignmentPattern = new RegExp(`${keyVariable}\\s*=\\s*(\\w+)\\(\\)`, 'g');
            const keyMatch = jsContent.match(keyAssignmentPattern);
            
            if (keyMatch) {
                const keyFunctionName = keyMatch[0].split('=')[1].trim().replace('()', '');
                console.log('Found key function from crypto pattern:', keyFunctionName);
                
                if (isConcatenationFunction(jsContent, keyFunctionName)) {
                    return extractKeyFromFunction(jsContent, keyFunctionName);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding decrypt key from crypto:', error);
        return null;
    }
}

/**
 * Extract function body from function definition
 */
function extractFunctionBody(jsContent, functionStart) {
    try {
        const startIndex = jsContent.indexOf(functionStart);
        if (startIndex === -1) return null;
        
        let braceCount = 0;
        let inFunction = false;
        let body = '';
        
        for (let i = startIndex; i < jsContent.length; i++) {
            const char = jsContent[i];
            
            if (char === '{') {
                inFunction = true;
                braceCount++;
            } else if (char === '}') {
                braceCount--;
            }
            
            if (inFunction) {
                body += char;
            }
            
            if (inFunction && braceCount === 0) {
                break;
            }
        }
        
        return body;
    } catch (error) {
        console.error('Error extracting function body:', error);
        return null;
    }
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
    
    // Extract decrypt key using new method
    const decryptKey = extractDecryptKey(jsContent);
    
    // Extract arrays using old method
    const result = extractDecryptionArrays(jsContent);
    
    // Create result object if not exists
    let finalResult = result || {};
    
    // Add decrypt key to result
    if (decryptKey) {
        finalResult.decryptionKey = decryptKey;
        console.log('\n🔑 Decrypt key extracted:', decryptKey);
    }
    
    console.log('Final result:', finalResult);

    // Display results
    console.log('\n🎉 EXTRACTION RESULTS:');
    console.log('====================');
    
    if (result) {
        console.log(`📝 String Array (${result.stringArray.name}): ${result.stringArray.length} elements`);
        console.log(`🔢 Number Array (${result.numberArray.name}): ${result.numberArray.length} elements`);
        console.log(`🔑 Decryption Key: ${result.keyLength} characters`);
        console.log(`🔍 Key Preview: ${result.analysis.keySample}`);
        
        if (result.warning) {
            console.log(`⚠️  Warning: ${result.warning}`);
        }
    } else {
        console.log('❌ Could not extract arrays (this is expected for some obfuscated files)');
    }
    
    if (decryptKey) {
        console.log(`🎯 New Decrypt Key: ${decryptKey}`);
        console.log(`🎯 Key Length: ${decryptKey.length} characters`);
        
        // Save results with decrypt key
        saveResults(finalResult);
        
        console.log('\n✅ SUCCESS! Decrypt key extracted successfully!');
        console.log('📄 Results saved to extracted_arrays.json');
        console.log('🚀 You can use this decrypt key to decrypt video sources.');
    } else {
        console.log('\n❌ COULD NOT EXTRACT DECRYPT KEY');
        console.log('======================');
        console.log('💡 Possible reasons:');
        console.log('   - File was obfuscated in a different way');
        console.log('   - Code structure has changed');
        console.log('   - Need to update patterns in script');
    }
}

main();