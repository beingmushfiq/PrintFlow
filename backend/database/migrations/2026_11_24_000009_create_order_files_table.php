<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_files', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26);
            $table->char('order_id', 26);
            $table->string('original_name');
            $table->string('object_key');
            $table->string('storage_disk', 32)->default('s3');
            $table->string('mime_type_detected', 128)->nullable();
            $table->string('file_extension_detected', 16)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('sha256_hash', 64)->nullable();
            $table->string('scan_status', 32)->default('pending'); // pending, clean, infected, error
            $table->string('processing_status', 32)->default('pending'); // pending, processing, ready, failed, rejected
            $table->integer('page_count')->nullable();
            $table->integer('width_px')->nullable();
            $table->integer('height_px')->nullable();
            $table->string('orientation', 16)->nullable();
            $table->string('preview_object_key')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('deleted_at')->nullable();
            $table->string('deletion_status', 32)->nullable();
            $table->string('deletion_error_code', 64)->nullable();
            $table->json('processing_json')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('cascade');

            $table->index(['tenant_id', 'order_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_files');
    }
};
