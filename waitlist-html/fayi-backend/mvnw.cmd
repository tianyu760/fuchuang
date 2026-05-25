@REM ----------------------------------------------------------------------------
@REM Maven Wrapper startup batch script
@REM ----------------------------------------------------------------------------
@IF "%__MVNW_ARG0_NAME__%"=="" (SET __MVNW_ARG0_NAME__=%~nx0)
@SET __ MVNW_CMD__=%COMSPEC% /D /E:ON /V:OFF /C CALL
@SET __MVNW_ERROR__=
@SET __MVNW_MAVEN_CONFIG=%USERPROFILE%\.m2

@SET MAVEN_PROJECTBASEDIR=%~dp0
@IF "%MAVEN_PROJECTBASEDIR:~-1%"=="\" SET MAVEN_PROJECTBASEDIR=%MAVEN_PROJECTBASEDIR:~0,-1%

@SET __MVNW_WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar
@SET __MVNW_WRAPPER_PROPS=%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.properties

@FOR /F "usebackq tokens=1,2 delims==" %%a IN ("%__MVNW_WRAPPER_PROPS%") DO (
  @IF "%%a"=="distributionUrl" SET __MVNW_DISTRIBUTION_URL=%%b
)

@IF EXIST "%__MVNW_WRAPPER_JAR%" GOTO validateDownloadedJar
@SET MVNW_VERBOSE=false
@IF "%MVNW_VERBOSE%"=="true" @ECHO Downloading Maven Wrapper jar...

@IF NOT "%MVNW_USERNAME%"=="" (
  @SET MVNW_DOWNLOAD_OPTS=--user %MVNW_USERNAME%:%MVNW_PASSWORD%
)

@FOR /F "usebackq tokens=1,* delims==" %%a IN ("%__MVNW_WRAPPER_PROPS%") DO (
  @IF "%%a"=="wrapperUrl" @SET __MVNW_WRAPPER_URL=%%b
)

@ECHO Downloading Maven Wrapper from %__MVNW_WRAPPER_URL% ...
@powershell -Command "&{"^
  "$webclient = new-object System.Net.WebClient;"^
  "if (-not ([string]::IsNullOrEmpty('%MVNW_USERNAME%') -and [string]::IsNullOrEmpty('%MVNW_PASSWORD%'))) {"^
  "$webclient.Credentials = new-object System.Net.NetworkCredential('%MVNW_USERNAME%', '%MVNW_PASSWORD%');"^
  "}"^
  "$webclient.DownloadFile('%__MVNW_WRAPPER_URL%', '%__MVNW_WRAPPER_JAR%')"^
"}"
@IF "%ERRORLEVEL%"=="0" GOTO validateDownloadedJar
@DEL /F "%__MVNW_WRAPPER_JAR%" 2>NUL
@ECHO Cannot download Maven Wrapper jar. Please install Maven (https://maven.apache.org/)
@EXIT /B 1

:validateDownloadedJar
@ECHO Launching Maven Wrapper ...
@java -jar "%__MVNW_WRAPPER_JAR%" %*
@EXIT /B %ERRORLEVEL%
