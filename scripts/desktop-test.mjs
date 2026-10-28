import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import electron from 'electron';
const root=path.resolve('.local','desktop-test-'+Date.now());await fs.mkdir(root,{recursive:true});
const env={...process.env,STUDIO_DATA_DIR:root,STUDIO_BUDGET_FILE:path.resolve('.local','test-budget.json'),STUDIO_DESKTOP_TEST:'1',STUDIO_LIVE_TEST:process.env.STUDIO_LIVE_TEST||'',STUDIO_EVIDENCE_DIR:process.env.STUDIO_EVIDENCE_DIR||path.resolve('evidence')};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(process.env.STUDIO_EXECUTABLE||electron,process.env.STUDIO_EXECUTABLE?[]:['.'],{windowsHide:true,stdio:'inherit',env});
child.on('exit',code=>process.exit(code||0));
