"""
tests/test_health.py
====================
Tests for the health check endpoint.
"""

import pytest


def test_health_returns_ok(client):
    """GET /health should return 200 with {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}


def test_root_returns_200(client):
    """GET / should return 200 (a redirect hint, not a 404)."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "docs" in data
