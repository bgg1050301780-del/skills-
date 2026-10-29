export interface Step {id:string;title:string;goal:string;input:string;tool:string;toolInput:string;toolOutput:string;toolFallback:string;toolConfirmed:boolean;requirements:string;output:string;error:string;done:string;refs:string[];dependsOn:string[]}
export interface FileRef {id:string;path:string;hash:string;size:number;category:string;aiAllowed:boolean}
export interface Project {schemaVersion:number;id:string;revision:number;name:string;slug:string;description:string;purpose:string;icon:string;status:string;triggers:{when:string;requests:string;avoid:string};inputs:{required:string;optional:string;formats:string};steps:Step[];exceptions:string;completion:string;files:FileRef[];source:null|{text:string;unknown:string;metadata:Record<string,unknown>;fingerprint:string};conflicts:string[];export:{format:'skill'|'design'|'backup';includeFiles:boolean};createdAt:string;updatedAt:string}
export interface Summary {id:string;name:string;slug:string;icon:string;status:string;updatedAt:string;revision:number}
export interface ChatAttachment {id:string;path:string;name:string;size:number;readable:boolean;reason:string}
export interface Message {role:string;text:string;at:string;attachments?:ChatAttachment[]}
export interface Proposal {summary:string;answer:string;baseRevision:number;operations:{type:string;stepId:string;field:string;value:string;position:number}[]}
export interface Session {threadId:string|null;messages:Message[];proposal:Proposal|null}
export interface Profile {id:string;name:string;baseUrl:string;model:string;auth:'key'|'official';hasKey?:boolean;key?:string}
export interface ModelState {selected:string;profiles:Profile[]}
declare global {interface Window {studio:{call:(action:string,payload?:unknown)=>Promise<any>;addFiles:(id:string,files:File[],forChat?:boolean,draftCount?:number)=>Promise<{project:Project;attachments:ChatAttachment[]}>;onAI:(callback:(event:any)=>void)=>()=>void}}}
