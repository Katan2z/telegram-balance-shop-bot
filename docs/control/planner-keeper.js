/* r_keeper HTML-in-XLS export. Data is parsed as text; never mounted as HTML. */
(function(root){
  'use strict';
  const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
  function plain(value){
    return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi,(_,key)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()])).replace(/\s+/g,' ').trim();
  }
  function numeric(value,integer=false){
    if(!value.trim())return null;
    const clean=value.replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
    if(!/^\d+(?:\.\d+)?$/.test(clean))throw Error(`Не удалось прочитать число «${value}»`);
    const result=Number(clean);
    if(!Number.isFinite(result)||integer&&!Number.isSafeInteger(result))throw Error(`Некорректное количество чеков «${value}»`);
    return result;
  }
  function date(value){
    const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(!m)return null;
    const iso=`${m[3]}-${m[2]}-${m[1]}`,d=new Date(iso+'T12:00:00Z');
    if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==iso)throw Error('Некорректная дата: '+value);
    return iso;
  }
  function parse(text){
    if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Файл слишком большой: максимум 2 МБ');
    if(!/<table\b/i.test(text))throw Error('Ожидается табличная выгрузка r_keeper: XLS с колонками «Чеков» и «Оплачено». Двоичные XLS и XLSX пока не поддерживаются.');
    const rows=[...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(match=>[...match[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]\s*>/gi)].map(c=>({text:plain(c[2]),span:Number(c[1].match(/colspan\s*=\s*["']?(\d+)/i)?.[1]||1)})));
    const header=rows.findIndex(row=>row.length&&row.every(cell=>/^\d{2}\.\d{2}\.\d{4}$/.test(cell.text)));
    if(header<0)throw Error('Не найдена строка с датами дней. Нужен отчёт по часам и датам, как в присланном примере.');
    const dates=rows[header].map(cell=>date(cell.text));
    if(dates.length!==7||new Set(dates).size!==7||rows[header].some(cell=>cell.span!==2))throw Error('Ожидаются семь дней с двумя колонками на день: «Чеков» и «Оплачено».');
    if(new Date(dates[0]+'T12:00:00Z').getUTCDay()!==1||dates.some((value,i)=>(Date.parse(value+'T12:00:00Z')-Date.parse(dates[0]+'T12:00:00Z'))!==i*86400000))throw Error('Выгрузите одну полную неделю с понедельника по воскресенье.');
    const metrics=rows[header+1];
    if(metrics?.length!==15||metrics[0].text!=='Час'||dates.some((_,i)=>metrics[i*2+1].text!=='Чеков'||metrics[i*2+2].text!=='Оплачено'))throw Error('Нужен порядок колонок «Час», затем «Чеков / Оплачено» для каждого дня.');
    const actuals=[],missing=[],seen=new Set();let totals=null;
    for(const row of rows.slice(header+2)){
      if(row[0]?.text==='Итого'){
        if(totals)throw Error('В файле несколько итогов — выгрузите один отчёт.');
        if(row.length!==15)throw Error('Повреждена строка итогов');
        totals=dates.map((date,i)=>({date,checks:numeric(row[i*2+1].text,true),revenue:numeric(row[i*2+2].text)}));continue;
      }
      if(!row.length||!/^\d{1,2}$/.test(row[0].text))continue;
      const hour=Number(row[0].text);
      if(totals||hour>23||row.length!==15||row.some(cell=>cell.span!==1)||seen.has(hour))throw Error('Повторный или некорректный час: '+row[0].text);
      seen.add(hour);
      dates.forEach((date,i)=>{
        const checks=numeric(row[i*2+1].text,true),revenue=numeric(row[i*2+2].text);
        if(checks===null&&revenue===null){missing.push({date,hour});return;}
        if(checks===null||revenue===null)throw Error(`${date}, ${hour}: заполнено только одно из полей «Чеков / Оплачено»`);
        actuals.push({date,hour,checks,revenue});
      });
    }
    if(!seen.size||!actuals.length||!totals)throw Error('Не найдены почасовые данные или строка «Итого».');
    const daily=dates.map((date,i)=>{
      const own=actuals.filter(row=>row.date===date),checks=own.reduce((sum,row)=>sum+row.checks,0),cents=own.reduce((sum,row)=>sum+Math.round(row.revenue*100),0);
      if(totals[i].checks===null||totals[i].revenue===null||checks!==totals[i].checks||Math.abs(cents-Math.round(totals[i].revenue*100))>1)throw Error(`${date}: сумма по часам не совпадает со строкой «Итого». Проверьте выгрузку.`);
      return {date,day:DAYS[i],checks,revenue:cents/100,averageCheck:checks?cents/100/checks:null};
    });
    return {dates,actuals,daily,missing,hours:[...seen].sort((a,b)=>a-b)};
  }
  function decode(bytes){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const utf8=new TextDecoder('utf-8').decode(data);
    try{return parse(utf8);}catch(first){
      if(!utf8.includes('\ufffd'))throw first;
      try{return parse(new TextDecoder('windows-1251').decode(data));}catch{throw first;}
    }
  }
  function missingTradingHours(report,config){
    return report.daily.flatMap(day=>{
      const p=config.periods[day.day],known=new Set(report.actuals.filter(row=>row.date===day.date).map(row=>row.hour));
      const expected=new Set();for(let minute=p.open;minute<p.close;minute+=30)expected.add(Math.floor(minute/60)%24);
      return [...expected].filter(hour=>!known.has(hour)).map(hour=>({day:day.day,date:day.date,hour}));
    });
  }
  function apply(report,config,{profiles=false,averageChecks=false,acknowledgeMissing=false}={}){
    const next=JSON.parse(JSON.stringify(config));
    if(profiles&&missingTradingHours(report,next).length&&!acknowledgeMissing)throw Error('В рабочие часы есть пропуски. Уточните режим работы или явно подтвердите отсутствие продаж.');
    if(profiles&&report.daily.some(day=>day.checks===0))throw Error('В один из дней нет чеков: нельзя построить распределение нагрузки.');
    if(averageChecks&&report.daily.some(day=>!day.averageCheck))throw Error('В один из дней невозможно рассчитать средний чек.');
    const merged=new Map((next.actuals||[]).map(row=>[`${row.date}/${row.hour}`,row]));
    report.actuals.forEach(row=>merged.set(`${row.date}/${row.hour}`,{...row}));next.actuals=[...merged.values()];
    if(profiles)report.daily.forEach(day=>{next.profiles[day.day]=Array.from({length:24},(_,hour)=>report.actuals.find(row=>row.date===day.date&&row.hour===hour)?.checks||0);});
    if(averageChecks)report.daily.forEach(day=>{next.forecasts[day.day].averageCheck=day.averageCheck;next.forecasts[day.day].checks=null;});
    next.keeperImport={sourceDates:[...report.dates],profiles,averageChecks,acknowledgeMissing:profiles&&acknowledgeMissing};
    return next;
  }
  const api={parse,decode,apply,missingTradingHours};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BK8Keeper=api;
})(typeof globalThis!=='undefined'?globalThis:this);
