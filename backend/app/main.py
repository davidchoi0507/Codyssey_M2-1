from fastapi import FastAPI

app = FastAPI(title="인디 앨범 스튜디오 API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
