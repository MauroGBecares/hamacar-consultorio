class HamacarCapture extends AudioWorkletProcessor {
 constructor(){super();this.enabled=true;this.buffer=new Float32Array(1024);this.offset=0;this.port.onmessage=({data})=>{if(data==='flush'){this.flush();this.port.postMessage({flushed:true})}if(data==='pause'){this.flush();this.enabled=false}if(data==='resume')this.enabled=true}}
 flush(){if(this.offset){const a=this.buffer.slice(0,this.offset);this.port.postMessage({samples:a},[a.buffer]);this.offset=0}}
 process(inputs){const samples=inputs[0]?.[0];if(this.enabled&&samples){for(let i=0;i<samples.length;i++){this.buffer[this.offset++]=samples[i];if(this.offset===this.buffer.length)this.flush()}}return true}
}
registerProcessor('hamacar-capture',HamacarCapture);
