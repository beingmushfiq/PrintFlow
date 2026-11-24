<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('file_deletion_events', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('order_id', 26)->nullable();
            $table->char('order_file_id', 26);
            $table->string('reason', 64)->default('order_completed'); // order_completed, privacy_ttl, cancelled
            $table->string('trigger_reason', 64)->nullable(); // backward compatibility
            $table->string('source', 64)->default('server_purge'); // agent_shred, server_purge
            $table->string('deletion_status', 64)->nullable(); // backward compatibility
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('local_shredded_at')->nullable();
            $table->timestamp('remote_purged_at')->nullable();
            $table->string('audit_hash', 64)->nullable();
            $table->json('details')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('set null');
            $table->foreign('order_file_id')->references('id')->on('order_files')->onDelete('cascade');

            $table->index(['tenant_id', 'deleted_at']);
            $table->index(['tenant_id', 'source']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('file_deletion_events');
    }
};
