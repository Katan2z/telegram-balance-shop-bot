importScripts('planner-engine.js?v=20261016-history');
self.onmessage = event => {
  try {self.postMessage({id:event.data.id,result:BK8Planner.generate(event.data.config,event.data.employees,event.data.shifts)});}
  catch(error){self.postMessage({id:event.data.id,error:error.message});}
};
