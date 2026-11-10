package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
)

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Fatalf("Error loading .env file: %v", err)
	}

	app := fiber.New()

	InitDB()

	defer GetDB().Close()

	SetupRoutes(app)

	_ = app.Listen(fmt.Sprintf(":%s", os.Getenv("PORT_SERVER")))

}
