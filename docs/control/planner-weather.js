(function(root){
  'use strict';
  function localHour(iso) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
  }
  function decode(data,now=new Date().toISOString()) {
    if(!Array.isArray(data?.properties?.timeseries))throw Error('Неверный ответ MET Norway');
    return {provider:'MET Norway',source:'https://api.met.no/',license:'CC BY 4.0',fetchedAt:now,modelUpdatedAt:data.properties.meta?.updated_at,
      latitude:53.9463,longitude:27.6882,timezone:'Europe/Minsk',hours:data.properties.timeseries.map(x=>({time:localHour(x.time),temperature:x.data?.instant?.details?.air_temperature??null,wind:x.data?.instant?.details?.wind_speed??null,precipitation:x.data?.next_1_hours?.details?.precipitation_amount??null}))};
  }
  async function load() {
    const response=await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=53.9463&lon=27.6882',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`MET Norway недоступен (${response.status}). Сохранённый снимок не заменён, доступна ручная поправка.`);
    return decode(await response.json());
  }
  root.BK8PlannerWeather={load,decode,localHour};
  if(typeof module!=='undefined')module.exports=root.BK8PlannerWeather;
})(typeof globalThis!=='undefined'?globalThis:this);
