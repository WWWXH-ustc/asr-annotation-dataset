# ASR 候选音频标注包

用于团队内部标注。包含 103 条完整 M4A 音频，总时长 81 小时 45 分 26 秒。XLSX 列出领域、子领域、原音时长和推荐标注区间。

从 Releases 下载 `annotation-guide.xlsx` 以及两个 ZIP 分卷。将分卷放在同一目录并按顺序拼接：

```sh
cat asr-audio.zip.part01 asr-audio.zip.part02 > asr-audio.zip
```

Windows 命令提示符可用：

```bat
copy /b asr-audio.zip.part01+asr-audio.zip.part02 asr-audio.zip
```

拼接后可使用随附的 `SHA256SUMS.txt` 核对原 ZIP，再正常解压。
