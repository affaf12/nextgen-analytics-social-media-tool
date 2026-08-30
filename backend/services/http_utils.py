def safe_json(response):
    """Returns (data, error). error is set if the body wasn't valid JSON."""
    try:
        return response.json(), None
    except ValueError:
        return None, f"Response JSON nahi tha (HTTP {response.status_code}): {response.text[:200]}"
