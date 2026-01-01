package websocket

import (
	"sync"
	"time"
)

const (
	// MinDelay is the minimum reconnection delay.
	MinDelay = 1 * time.Second
	// MaxDelay is the maximum reconnection delay.
	MaxDelay = 30 * time.Second
	// Multiplier for exponential backoff.
	Multiplier = 2
)

// Reconnect handles exponential backoff for reconnection attempts.
type Reconnect struct {
	mu      sync.Mutex
	delay   time.Duration
	attempt int
}

// NewReconnect creates a new Reconnect handler.
func NewReconnect() *Reconnect {
	return &Reconnect{
		delay: MinDelay,
	}
}

// NextDelay returns the next delay and increments the attempt counter.
func (r *Reconnect) NextDelay() time.Duration {
	r.mu.Lock()
	defer r.mu.Unlock()

	delay := r.delay
	r.attempt++

	// Calculate next delay with exponential backoff
	r.delay = r.delay * time.Duration(Multiplier)
	if r.delay > MaxDelay {
		r.delay = MaxDelay
	}

	return delay
}

// Reset resets the reconnection state after a successful connection.
func (r *Reconnect) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.delay = MinDelay
	r.attempt = 0
}

// Attempt returns the current attempt number.
func (r *Reconnect) Attempt() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.attempt
}
