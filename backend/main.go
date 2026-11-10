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

	app := fiber.New(fiber.Config{
		AppName: "TEMU",
	})

	InitDB()

	defer GetDB().Close()

	SetupRoutes(app)

	port := os.Getenv("PORT_SERVER")

	log.Printf("🚀 Servidor corriendo en el puerto %s", port)
	if err := app.Listen(fmt.Sprintf(":%s", port)); err != nil {
		log.Fatalf("❌ Error al levantar el servidor: %v", err)
	}

}
