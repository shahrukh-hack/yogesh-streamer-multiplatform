// Standalone Node.js verification script for Dean Edwards JS Unpacking
function unpack(packedJs) {
    const regex = /eval\(function\(p,a,c,k,e,[rd]\)\{[\s\S]*?\}\('(.*?)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/;
    const match = packedJs.match(regex);
    if (!match) return null;

    let payload = match[1];
    const radix = parseInt(match[2], 10) || 10;
    const count = parseInt(match[3], 10) || 0;
    const symtab = match[4].split('|');

    function baseN(num, base) {
        const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (num === 0) return "0";
        let n = num;
        let res = "";
        while (n > 0) {
            res = chars[n % base] + res;
            n = Math.floor(n / base);
        }
        return res;
    }

    for (let i = count - 1; i >= 0; i--) {
        const word = symtab[i] || baseN(i, radix);
        const key = baseN(i, radix);
        payload = payload.replace(new RegExp('\\b' + key + '\\b', 'g'), word);
    }
    return payload;
}

// Test sample: Simulated packed video stream metadata
const samplePacked = `eval(function(p,a,c,k,e,r){e=String;if(!''.replace(/^/,String)){while(c--)r[c]=k[c]||c;k=[function(e){return r[e]}];e=function(){return'\\\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c]);return p}('0 1={2:\"3://4.5/6/7.8\"};',9,9,'const|playerConfig|file|https|cdn|streamhost|live|master|m3u8'.split('|'),0,{}))`;

console.log("=== RUNNING EXTRACTOR DEOBFUSCATION TEST ===");
console.log("Input Packed JS (Length):", samplePacked.length, "bytes");
const result = unpack(samplePacked);
console.log("Deobfuscated Result:", result);

if (result && result.includes("https://cdn.streamhost/live/master.m3u8")) {
    console.log("✅ TEST PASSED: Extractor successfully extracted direct .m3u8 stream!");
} else {
    console.log("❌ TEST FAILED");
}
