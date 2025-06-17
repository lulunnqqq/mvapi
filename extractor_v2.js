import fs from 'fs';
import path from 'path';

/**
 * Extractor v2 - Automatically extract key from deobfuscated JavaScript file
 * Following flow: getSources API -> __z1d function -> Z() function -> array t
 */

// Global debug flag
const DEBUG = true;

/**
 * Logging utility function
 */
function log(message) {
    if (DEBUG) {
        console.log(`[ExtractorV2] ${message}`);
    }
}

/**
 * Read JavaScript file
 */
function readJSFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        log(`File read successfully: ${filePath}`);
        return content;
    } catch (error) {
        throw new Error(`Cannot read file ${filePath}: ${error.message}`);
    }
}

/**
 * Step 1: Find getSources API call
 */
function findGetSourcesAPI(content) {
    const apiPattern = /\/embed-1\/v2\/e-1\/getSources\?id=/;
    const match = content.match(apiPattern);
    
    if (!match) {
        throw new Error('getSources API not found');
    }
    
    log('✓ Step 1: Found getSources API');
    return match.index;
}

/**
 * Step 2-3: Find function handling response containing __z1d
 */
function findZ1dFunction(content) {
    // Find all positions with __z1d
    const z1dPattern = /__z1d.*?=.*?=>/g;
    const matches = [];
    let match;
    
    while ((match = z1dPattern.exec(content)) !== null) {
        matches.push({
            index: match.index,
            content: match[0]
        });
    }
    
    if (matches.length === 0) {
        throw new Error('__z1d function not found');
    }
    
    log(`✓ Step 2-3: Found ${matches.length} __z1d positions`);
    return matches;
}

/**
 * Step 4-5: Find function Z() inside __z1d
 */
function findZFunction(content) {
    // Find pattern: Z = () => {
    const zFunctionPattern = /Z\s*=\s*\(\)\s*=>\s*{/;
    const match = content.match(zFunctionPattern);
    
    if (!match) {
        throw new Error('Function Z not found');
    }
    
    log('✓ Step 4-5: Found function Z');
    return match.index;
}

/**
 * Step 6-7: Extract array t from function Z
 */
function extractArrayT(content) {
    // Find array t definition before function Z
    // Pattern: t = ["72", "41", "62", ...]
    const arrayPattern = /t\s*=\s*\[([^\]]+)\]/;
    const match = content.match(arrayPattern);
    
    if (!match) {
        throw new Error('Array t not found');
    }
    
    // Parse array t
    const arrayString = match[1];
    const arrayValues = arrayString
        .split(',')
        .map(item => item.trim().replace(/['"]/g, ''))
        .filter(item => item.length > 0);
    
    log(`✓ Step 6-7: Found array t with ${arrayValues.length} elements`);
    log(`Array t: [${arrayValues.slice(0, 5).join(', ')}...]`);
    
    return arrayValues;
}

/**
 * Step 8: Convert array t to key
 */
function convertArrayToKey(arrayT) {
    try {
        const key = arrayT.map(n => String.fromCharCode(parseInt(n, 16))).join('');
        log(`✓ Step 8: Successfully converted array to key`);
        log(`Key: ${key}`);
        return key;
    } catch (error) {
        throw new Error(`Array conversion error: ${error.message}`);
    }
}

/**
 * Step 9: Save result to JSON file
 */
function saveToJSON(key, arrayT) {
    const result = {
        timestamp: new Date().toISOString(),
        decryptionKey: key,
    };

    const outputPath = 'extracted_arrays.json';
    
    try {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
        log(`✓ Step 9: Result saved to ${outputPath}`);
        return outputPath;
    } catch (error) {
        throw new Error(`File save error: ${error.message}`);
    }
}

/**
 * Method to validate and compare with old extractor
 */
function validateResult(key) {
    // Check key length (usually around 32-64 characters)
    if (key.length < 10) {
        log('⚠️  Warning: Key seems too short');
    }
    
    // Check if contains special characters
    const hasSpecialChars = /[^a-zA-Z0-9]/.test(key);
    if (hasSpecialChars) {
        log('✓ Key contains special characters (normal)');
    }
    
    log(`Key statistics: Length=${key.length}, Special chars=${hasSpecialChars}`);
    
    return {
        length: key.length,
        hasSpecialChars: hasSpecialChars,
        isValid: key.length > 10
    };
}

/**
 * Execute the complete extraction process
 */
function extractKey(inputFile) {
    try {
        log('=== STARTING EXTRACTION PROCESS ===');
        
        // Read file
        const content = readJSFile(inputFile);
        
        // Execute steps in order
        findGetSourcesAPI(content);
        findZ1dFunction(content);
        findZFunction(content);
        const arrayT = extractArrayT(content);
        const key = convertArrayToKey(arrayT);
        const outputPath = saveToJSON(key, arrayT);
        
        log('=== EXTRACTION COMPLETED SUCCESSFULLY ===');
        
        return {
            success: true,
            key: key,
            array: arrayT,
            outputFile: outputPath
        };
        
    } catch (error) {
        log(`❌ ERROR: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// Main execution
function main() {
    const inputFile = './output.js';
    
    console.log('🚀 Starting ExtractorV2...\n');
    
    const result = extractKey(inputFile);
    
    if (result.success) {
        console.log('\n✅ Extraction successful!');
        console.log(`📄 Output file: ${result.outputFile}`);
        console.log(`🔑 Key: ${result.key}`);
        
        // Validate result
        validateResult(result.key);
        
    } else {
        console.log('\n❌ Extraction failed!');
        console.log(`📄 Error: ${result.error}`);
        process.exit(1);
    }
}

// Execute main function
main();

// Export functions for potential module usage
export {
    extractKey,
    readJSFile,
    findGetSourcesAPI,
    findZ1dFunction,
    findZFunction,
    extractArrayT,
    convertArrayToKey,
    saveToJSON,
    validateResult
};
