function batchfileObfuscate(script, passes = 1) {
  let res = script;
  for (let i = 0; i < passes; i++) {
    const stringVar0 = "@ 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const stringVar1 = "_ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûüabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const stringVar2 = "_¯-\u009D\u0010\u0006\u0016\u001C\u000B\u000E\u0014\u0015\u0018\u0012\u0001\u0003\u007Fஐ→あⓛⓞⓥⓔ｡°º¤εïз╬㊗⑪⑫⑬㊀㊁㊂のðabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const stringGen1 = shuffle(stringVar1).slice(0, randInt(3,5));
    let stringGen2 = "";

    let arr = shuffleArray([...stringVar0]);
    const table = arr.map((ch, idx) => {
      stringGen2 += ch;
      return [ch, `%${stringGen1}:~${idx},1%`];
    });

    let out = "";
    let sawLine = true, inVar = false, inLabel = false;

    if (i === passes - 1) out += "\uFFFE&@cls&";
    out += `@set "${stringGen1}=${stringGen2}"\r\n`;

    for (let c of res) {
      if (sawLine && c === ":") inLabel = true;
      if (c === "\n") {
        sawLine = true;
        inVar = inLabel = false;
        out += c;
        continue;
      } else sawLine = false;

      if (c === " ") inLabel = false;
      if (!inVar && (c === "%"||c==="!")) inVar = true;
      else if (inVar && (c === "%"||c==="!")) {
        inVar = false;
        inLabel = false;
      }

      if (!inVar && !inLabel && c !== "\n") {
        let found = false;
        for (let [a,b] of table) {
          if (c === a) {
            out += (randInt(1,20)===8)
              ? b + "%" + shuffle(stringVar1).slice(3,10) + "%"
              : b;
            found = true;
            break;
          }
        }
        if (!found) out += c;
      } else {
        out += c;
      }
    }

    res = out;
  }
  return res;
}

function randInt(a,b) { return Math.floor(Math.random()*(b-a+1))+a }
function shuffle(s) { return s.split('').sort(()=>0.5-Math.random()).join('') }
function shuffleArray(a) {
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
