// Audio stays in this worker. Only public model/runtime resources are fetched.
let transcriber;
const MODEL='onnx-community/whisper-tiny';
const REVISION='ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
self.onmessage=async({data})=>{
 if(data.type==='prepare'){
  try{
   const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
   env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;
   let lastProgress=0;
   const progress_callback=p=>{if(Date.now()-lastProgress<150&&p.status==='progress')return;lastProgress=Date.now();self.postMessage({type:'progress',label:p.status==='progress'?'Descargando modelo… '+Math.round(p.progress||0)+'%':'Preparando modelo local…'});};
   async function load(device){const candidate=await pipeline('automatic-speech-recognition',MODEL,{revision:REVISION,device,dtype:'q8',progress_callback});try{await candidate(new Float32Array(16000),{language:'spanish',task:'transcribe',max_new_tokens:1});return candidate}catch(e){await candidate.dispose();throw e}}
   let device='wasm';
   if(self.navigator?.gpu){try{device='webgpu';transcriber=await load(device)}catch{device='wasm';self.postMessage({type:'progress',label:'Probando compatibilidad local…'});}}
   if(!transcriber)transcriber=await load('wasm');
   self.postMessage({type:'ready',device});
  }catch{self.postMessage({type:'error',phase:'prepare'})}
 }
 if(data.type==='transcribe'){
  let audio=data.audio;
  try{
   if(!transcriber||!(audio instanceof Float32Array)||audio.length>960000)throw Error('Invalid audio');
   const output=await transcriber(audio,{language:'spanish',task:'transcribe',chunk_length_s:30,stride_length_s:5,return_timestamps:false,do_sample:false});
   self.postMessage({type:'result',text:typeof output.text==='string'?output.text.trim():''});
  }catch{self.postMessage({type:'error',phase:'transcribe'})}
  finally{audio?.fill(0);audio=null;data.audio=null;}
 }
};
