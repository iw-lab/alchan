@echo off
set "JAVA_HOME=C:\Program Files\Java\jdk-25"
set "Path=%Path%;%JAVA_HOME%\bin"
echo "--- Running with updated path ---"
where java
firebase emulators:start
