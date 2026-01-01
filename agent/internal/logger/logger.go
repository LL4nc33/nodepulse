// Package logger provides a simple level-based logger for the NodePulse agent.
package logger

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Level represents the logging level.
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

var levelNames = map[Level]string{
	LevelDebug: "DEBUG",
	LevelInfo:  "INFO",
	LevelWarn:  "WARN",
	LevelError: "ERROR",
}

// Logger is a simple level-based logger.
type Logger struct {
	level Level
}

// New creates a new Logger with the specified level.
func New(levelStr string) *Logger {
	level := LevelInfo
	switch strings.ToLower(levelStr) {
	case "debug":
		level = LevelDebug
	case "info":
		level = LevelInfo
	case "warn", "warning":
		level = LevelWarn
	case "error":
		level = LevelError
	}
	return &Logger{level: level}
}

// log writes a log message if the level is enabled.
func (l *Logger) log(level Level, format string, args ...interface{}) {
	if level < l.level {
		return
	}
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	levelName := levelNames[level]
	message := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stdout, "[%s] [%s] %s\n", timestamp, levelName, message)
}

// Debug logs a debug message.
func (l *Logger) Debug(format string, args ...interface{}) {
	l.log(LevelDebug, format, args...)
}

// Info logs an info message.
func (l *Logger) Info(format string, args ...interface{}) {
	l.log(LevelInfo, format, args...)
}

// Warn logs a warning message.
func (l *Logger) Warn(format string, args ...interface{}) {
	l.log(LevelWarn, format, args...)
}

// Error logs an error message.
func (l *Logger) Error(format string, args ...interface{}) {
	l.log(LevelError, format, args...)
}

// SetLevel changes the logging level.
func (l *Logger) SetLevel(levelStr string) {
	switch strings.ToLower(levelStr) {
	case "debug":
		l.level = LevelDebug
	case "info":
		l.level = LevelInfo
	case "warn", "warning":
		l.level = LevelWarn
	case "error":
		l.level = LevelError
	}
}

// Default logger instance
var defaultLogger = New("info")

// Debug logs a debug message using the default logger.
func Debug(format string, args ...interface{}) {
	defaultLogger.Debug(format, args...)
}

// Info logs an info message using the default logger.
func Info(format string, args ...interface{}) {
	defaultLogger.Info(format, args...)
}

// Warn logs a warning message using the default logger.
func Warn(format string, args ...interface{}) {
	defaultLogger.Warn(format, args...)
}

// Error logs an error message using the default logger.
func Error(format string, args ...interface{}) {
	defaultLogger.Error(format, args...)
}

// SetDefaultLevel sets the level for the default logger.
func SetDefaultLevel(levelStr string) {
	defaultLogger.SetLevel(levelStr)
}
