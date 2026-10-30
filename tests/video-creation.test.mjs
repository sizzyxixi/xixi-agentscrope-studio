import assert from 'node:assert/strict';
import test from 'node:test';
import {videoInputIssue,videoPromptFields,changeVideoPromptField,videoSettingsFromFields,keepsSourceDuration} from '../app/video-creation.ts';
import {creativeTurnTrace} from '../app/creative-turn.ts';

test('commerce video requires a product identity while source workflows require original video',()=>{
 const empty={hasProduct:false,hasImage:false,hasVideo:false};
 assert.match(videoInputIssue('商品视频',empty),/商品/);
 assert.equal(videoInputIssue('带货视频',{...empty,hasImage:true}),null);
 assert.match(videoInputIssue('视频复刻',{...empty,hasProduct:true}),/参考视频/);
 assert.match(videoInputIssue('视频复刻',{...empty,hasVideo:true}),/商品/);
 assert.equal(videoInputIssue('视频复刻',{...empty,hasImage:true,hasVideo:true}),null);
 for(const tool of ['视频编辑','视频翻译']){
  assert.match(videoInputIssue(tool,empty),/原视频/);
  assert.equal(videoInputIssue(tool,{...empty,hasVideo:true}),null);
 }
});
test('source-based workflows keep their timeline; duration and market survive session restoration',()=>{
 assert.equal(keepsSourceDuration('视频翻译'),true);
 assert.equal(keepsSourceDuration('视频编辑'),true);
 assert.equal(keepsSourceDuration('视频复刻'),false);
 assert.deepEqual(videoSettingsFromFields({videoDuration:'12',videoCountry:'DE',videoLanguage:'德语'}),{duration:12,country:'DE',language:'德语'});
 assert.deepEqual(videoSettingsFromFields({videoDuration:'999',videoCountry:'invalid',videoLanguage:'unknown'},'法语'),{duration:5,country:'US',language:'法语'});
});
test('scenario drafts are independent and expose the relevant editable choices',()=>{
 const first=videoPromptFields('视频翻译');first[0].options.push('custom');first[0].value='custom';
 assert.equal(videoPromptFields('视频翻译')[0].value,'配音与字幕');
 assert.equal(videoPromptFields('视频翻译')[0].options.includes('custom'),false);
 assert.ok(videoPromptFields('带货视频').some(field=>field.key==='selling'));
 assert.ok(videoPromptFields('视频编辑').some(field=>field.key==='range'));
});
test('video planning traces describe a plan rather than completed image generation',()=>{
 const trace=creativeTurnTrace({mode:'video',tool:'视频翻译',platform:'通用',site:'US',ratio:'智能比例',quality:'1080P'},0,'2026-10-30T00:00:00Z');
 assert.equal(trace.tools.at(-1).name,'video.plan');
 assert.match(trace.tools.at(-1).result,/方案/);
 assert.ok(!trace.tools.some(tool=>tool.name==='image.generate'));
});

test('translation output choices do not contradict subtitle settings',()=>{
 const initial=videoPromptFields('视频翻译');
 const voice=changeVideoPromptField(initial,'translation','仅翻译配音');
 assert.equal(voice.find(field=>field.key==='subtitles').value,'不添加字幕');
 const captions=changeVideoPromptField(voice,'subtitles','双语字幕');
 assert.equal(captions.find(field=>field.key==='translation').value,'配音与字幕');
 const onlyCaptions=changeVideoPromptField(voice,'translation','仅翻译字幕');
 assert.equal(onlyCaptions.find(field=>field.key==='subtitles').value,'目标语言字幕');
 assert.equal(initial.find(field=>field.key==='translation').value,'配音与字幕');
});
