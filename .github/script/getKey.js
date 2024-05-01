import fs from 'fs';


const getKey = () => {



    const cleaned = process.argv[2];
    if (!cleaned) {
        return;
    }

    const output = process.argv[3];
    if (!output) {
        return;
    }

    const data =  fs.readFileSync(cleaned, 'utf8');
    let keyExtracted = data.match(/JScripts\, *['"]([^'"]+)/i);

    console.log({keyExtracted, data})

    if (!keyExtracted) {
        return;
    }
    fs.writeFileSync(output, keyExtracted);
    return;
}
getKey();