# ASR 候选音频标注包

用于团队内部标注。包含 103 条完整 M4A 音频，总时长 81 小时 45 分 26 秒。XLSX 列出领域、子领域、原音时长及音频元数据。

从 Releases 下载 `annotation-guide.xlsx` 以及两个 ZIP 分卷。将分卷放在同一目录并按顺序拼接：

```sh
cat asr-audio.zip.part01 asr-audio.zip.part02 > asr-audio.zip
```

Windows 命令提示符可用：

```bat
copy /b asr-audio.zip.part01+asr-audio.zip.part02 asr-audio.zip
```

拼接后可使用随附的 `SHA256SUMS.txt` 核对原 ZIP，再正常解压。

## AliMeeting4MUG 会议文本语料

原始数据压缩包、官方说明与校验文件见 [datasets/AliMeeting4MUG](datasets/AliMeeting4MUG/DOWNLOAD.md)。共654场去重会议，包含训练集、开发集及测试集文本。

## 声谱 ASR 媒体工作台

在本机播放标注包音频、查看同步字幕和导出片段记录。跨机器部署和素材导入见[工作台 README](workbench/README.md)。
